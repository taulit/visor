# A moment asked for in words: the time twelve hours ago, and below it what
# was asked, how far away it is and the day.
source "$repo/scripts/scenarios/search-lib.sh"
content_register
search_without_providers
search_register
search_query 'vor 12h'
