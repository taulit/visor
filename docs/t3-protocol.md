# T3 Code protocol, as far as Visor uses it

Read from the local checkout `~/development/t3code` at commit `afe7e876` (2026-11-07, a fork of
[pingdotgg/t3code](https://github.com/pingdotgg/t3code), MIT). Paths below are relative to that repository.
The only request sent to a real server while writing this was the public
`GET /.well-known/t3/environment`; everything else is from the source and runs against `tests/t3-mock/`.

## 1. Finding the local server

- The server writes `<base>/userdata/server-runtime.json` while it runs and removes it when it stops
  (`apps/server/src/serverRuntimeState.ts`, path from `deriveServerPaths` in `apps/server/src/config.ts`).
  `<base>` is `$T3CODE_HOME`, else `~/.t3` (`apps/server/src/cli/app.ts`). A development server uses
  `<base>/dev/` instead of `userdata/`.
- The file is one JSON object: `{"version":1,"pid":…,"port":3773,"origin":"http://127.0.0.1:3773",…}`.
  Visor uses `origin`. The default port is 3773 (`DEFAULT_PORT`).
- Visor: the setting `t3-server-url` wins when set; otherwise `origin` of that file. No file means no
  server.

## 2. Connecting and authenticating

The environment issues its own sessions (`docs/internals/environment-auth.md`,
`apps/server/src/auth/EnvironmentAuth.ts`, routes in `packages/contracts/src/environmentHttp.ts`).

1. **Descriptor** (public): `GET /.well-known/t3/environment` →
   `{environmentId, label, serverVersion, orchestrationProtocolVersion, capabilities}`.
2. **Pairing**, once per device, as the mobile app does (`apps/mobile/src/features/connection/pairing.ts`,
   `packages/client-runtime/src/authorization/remote.ts`): the user creates a one-time pairing token in
   T3 Code (Settings → Connections, or `t3 auth pairing create`), shown as `<origin>/pair#token=<code>`.
   The client exchanges it:
   `POST /oauth/token`, form-encoded: `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`,
   `subject_token=<code>`, `subject_token_type=urn:t3:params:oauth:token-type:environment-bootstrap`,
   `requested_token_type=urn:ietf:params:oauth:token-type:access_token`, optional `scope` (space
   separated), `client_label`, `client_device_type`, `client_os` →
   `{access_token, token_type: "Bearer", expires_in, scope}`.
   Visor needs the scopes `orchestration:read orchestration:operate`
   (`apps/server/src/auth/RpcAuthorization.ts`). `t3 auth session issue` prints such a token directly.
3. **WebSocket ticket**, per connection: `POST /api/auth/websocket-ticket/rpc` with
   `Authorization: Bearer <access_token>` → `{ticket, expiresAt}`. 401 means the token is unknown or
   revoked.
4. **Socket**: `ws://<host>/ws?orchestrationProtocol=2&wsTicket=<ticket>` (`apps/server/src/ws.ts`).

Visor does step 1, 3 and 4. Step 2 belongs to the settings; the module reads the token from the setting
`t3-access-token` and stays empty and silent without one.

## 3. Messages

The socket speaks Effect RPC with JSON serialization (`effect/rpc/RpcMessage.ts`, effect 4.1.2): one JSON
value per frame, an object or an array of objects.

| Direction       | Frame                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| client → server | `{"_tag":"Request","id":"<n>","tag":"<method>","payload":{…},"headers":[]}`                                                         |
| server → client | `{"_tag":"Chunk","requestId":"<n>","values":[…]}` for streams                                                                       |
| client → server | `{"_tag":"Ack","requestId":"<n>"}` after every chunk, or the stream stalls                                                          |
| server → client | `{"_tag":"Exit","requestId":"<n>","exit":{"_tag":"Success","value":…}}` or `{"_tag":"Failure","cause":[{"_tag":"Fail","error":…}]}` |
| both            | `{"_tag":"Ping"}` / `{"_tag":"Pong"}`; `{"_tag":"Defect","defect":…}` ends everything                                               |

Methods and schemas are in `packages/contracts/src/orchestrationV2.ts` (`ORCHESTRATION_V2_WS_METHODS`,
`OrchestrationV2RpcSchemas`).

### Threads: `orchestration.subscribeShell`

Payload `{}` (plus `omitIdleSubagents` / `omitOlderSettled` only for servers that advertise the capabilities
`shellThreadFamilies` / `shellOlderSettled`). Stream items (`OrchestrationV2ShellStreamItem`):

- `{kind:"snapshot", snapshot:{projects:[{id,title,…}], threads:[ThreadShell], archivedThreads:[…]}}`
- `{kind:"thread.updated", location:"active"|"archive", thread:ThreadShell}`, `{kind:"thread.removed", threadId}`
- `{kind:"project.updated", project}`, `{kind:"project.removed", projectId}`, `{kind:"synchronized"}`

Of `OrchestrationV2ThreadShell` Visor reads: `id`, `projectId`, `title`, `lineage`
(`parentThreadId`, `relationshipToParent`, `sideChat`), `status`
(`idle|preparing|queued|starting|running|waiting|completed|interrupted|failed|cancelled|rolled_back`),
`activityRunStatus`, `activityRunStartedAt`, `latestRunStartedAt`, `latestRunCompletedAt`,
`latestRunStopRequested`, `lastError`, `pendingRuntimeRequest` (`{id, kind, createdAt}`),
`latestVisibleMessage` (`{role, text}`), `settledOverride`, `archivedAt`, `deletedAt`, `updatedAt`, and
`modelSelection`, `runtimeMode`, `interactionMode` to start a thread like the last one.

Status as in `packages/shared/src/agentAwareness.ts`: a pending request of kind `user_input` is a question,
any other except `auth_refresh` an approval; else `activityRunStatus ?? status`: `preparing|starting` →
starting, `running|waiting` → working, `completed` → done, `failed` → error, the rest is not shown.
Subagent threads (`relationshipToParent: "subagent"`) and side chats are not listed; a pending request of a
subagent makes its listed ancestor wait, and the answer goes to the subagent's thread.

### What an approval asks: `orchestration.getThreadProjection`

The shell names only the request id and kind (`command`, `file-read`, `file-change`, `mcp-elicitation`,
`permission`). The command or file is the `prompt` of the turn item
`{type:"approval_request", requestId, requestKind, prompt, reason}` in the projection
(`packages/client-runtime/src/state/threadRequests.ts`). Payload `{threadId}` → `{turnItems:[…], …}`.

### Actions: `orchestration.dispatchCommand`

Payload is one `OrchestrationV2Command`, the result `{sequence}`. `commandId` and `messageId` are fresh
UUIDs (`packages/client-runtime/src/operations/commands.ts`).

- Approve / deny: `{type:"runtime-request.respond", commandId, threadId, requestId, decision:"accept"|"decline"}`
- Reply: `{type:"message.dispatch", commandId, createdBy:"user", creationSource:"web", threadId, messageId,
text, attachments:[], dispatchMode:{type:"start_immediately"}, deliveryIntent:"auto"}`
- Stop: `{type:"thread.stop", commandId, threadId}`; servers without the capability
  `threadStop` get `{type:"run.interrupt", commandId, threadId, runId}` with the `activeRunId` of the shell
- New thread: `orchestration.launchThread` with `{commandId, creationSource:"web", threadId, projectId,
title, generateTitle:true, modelSelection, runtimeMode, interactionMode, workspaceStrategy:{type:"root"},
initialMessage:{messageId, text, attachments:[]}}`

### Last agent message

`latestVisibleMessage` of the thread shell, when its `role` is `assistant`.

### Open in T3 Code

`<origin>/threads/<environmentId>/<threadId>` (`buildAgentAwarenessDeepLink`, web route
`apps/web/src/routes/threads.$environmentId.$threadId.tsx`). It opens in the default browser. The desktop
app registers `t3code://` only for pairing links, so there is no link that raises the desktop window.

## 4. Version

`ORCHESTRATION_PROTOCOL_VERSION = 2` (`packages/contracts/src/environment.ts`). The descriptor carries it
as `orchestrationProtocolVersion`; the socket requires `?orchestrationProtocol=2` and answers anything else
with HTTP 426 and `{"code":"orchestration_protocol_incompatible","orchestrationProtocolVersion":2}`; the
HTTP API wants the header `x-t3-orchestration-protocol: 2`. Visor compares the descriptor with the version
it was written for before it asks for a ticket, logs one line when they differ and stays empty.
