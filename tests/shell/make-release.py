"""Test helper: two releases 9.9.9 of the installed Visor for a server on this
machine. good.zip is the installed files with version-name 9.9.9 and a file
UPDATED; bad.zip says version 1.0.0 inside. latest.json and latest-bad.json
are answers of the GitHub API that point at them.

Usage: python3 make-release.py INSTALLED_DIR OUT_DIR PORT UUID
"""
import json, os, sys, zipfile
src, out, port, uuid = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
def pack(name, version, marker):
    with zipfile.ZipFile(f"{out}/{name}", "w") as z:
        for root, _, files in os.walk(src):
            for f in files:
                path = os.path.join(root, f)
                rel = os.path.relpath(path, src)
                if rel == "metadata.json" or rel.endswith("gschemas.compiled"):
                    continue
                z.write(path, rel)
        meta = json.load(open(f"{src}/metadata.json"))
        meta["version-name"] = version
        z.writestr("metadata.json", json.dumps(meta))
        z.writestr("UPDATED", marker)
pack("good.zip", "9.9.9", "yes")
pack("bad.zip", "1.0.0", "no")
for name, zip_name in (("latest.json", "good.zip"), ("latest-bad.json", "bad.zip")):
    json.dump({"tag_name": "v9.9.9", "draft": False, "prerelease": False,
               "html_url": f"http://127.0.0.1:{port}/",
               "assets": [{"name": f"{uuid}.shell-extension.zip",
                           "browser_download_url": f"http://127.0.0.1:{port}/{zip_name}"}]},
              open(f"{out}/{name}", "w"))
