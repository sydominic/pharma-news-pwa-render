# API Contract - v13-link-actionfix

## GET /api/health
Returns API status and active Supabase column compatibility information.

## GET /api/config
Returns UI runtime config.

```json
{
  "regulatoryDashboardUrl": "",
  "apiVersion": "v13-link-actionfix"
}
```

## GET /api/news
Query params:

- `startDate`: YYYY-MM-DD
- `endDate`: YYYY-MM-DD
- `category`: comma-separated multi-select value
- `source`: comma-separated multi-select value
- `importance`: comma-separated multi-select value
- `q`: search keyword
- `page`: page number
- `pageSize`: 10-150

## GET /api/stats
Same filter params as `/api/news` except pagination. Returns:

- `total`
- `categories`
- `sources`
- `importances`
- `trend`
- `summary`
- `mainNews`
- `issueGroups`
- `actionMonitor`

## POST /api/collect
Body:

```json
{
  "startDate": "2026-05-14",
  "endDate": "2026-05-20",
  "collectDays": 7,
  "maxItemsPerQuery": 100
}
```

Collects Google News RSS based on `data/rss_sources.json`, applies stage-2 noise filtering/title normalization/strict recall-disposition classification, upserts to Supabase `news_articles`, and updates `collection_log`.
