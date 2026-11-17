# The list of results over the open panel: the hint of a command whose
# arguments are still missing, apps, and the results of a module.
source "$repo/scripts/scenarios/search-lib.sh"
content_register
search_without_providers
search_register
search_query 'timer'
