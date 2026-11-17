# A converted amount in the list of results, with rates from a prepared cache
# file so that the screenshot needs no network.
source "$repo/scripts/scenarios/search-lib.sh"
content_register
search_without_providers
search_register
mkdir -p "$XDG_CACHE_HOME/visor"
printf '{"fetched":%s000,"date":"2026-11-13","rates":{"EUR":1,"USD":1.0812,"GBP":0.8377,"CHF":0.9368,"JPY":166.73}}' \
    "$(date +%s)" >"$XDG_CACHE_HOME/visor/rates.json"
search_query '100 usd in eur'
