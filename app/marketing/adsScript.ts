/* The Google Ads script an owner pastes once into Google Ads (Tools, Bulk actions, Scripts). */
export function googleAdsScript(url: string, key: string) {
  return `// Light DMV app: sends the last 30 days of Google Ads and Local Services numbers, keywords and search terms to the Marketing tab, daily.
function main() {
  var rows = AdsApp.search("SELECT segments.date, campaign.advertising_channel_type, metrics.cost_micros, metrics.clicks, " +
    "metrics.impressions, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS");
  var by = { google: {}, lsa: {} };
  while (rows.hasNext()) {
    var r = rows.next();
    var src = r.campaign.advertisingChannelType === "LOCAL_SERVICES" ? "lsa" : "google";
    var d = by[src][r.segments.date] = by[src][r.segments.date] || { day: r.segments.date, spend: 0, clicks: 0, impressions: 0, leads: 0 };
    d.spend += Number(r.metrics.costMicros) / 1e6; d.clicks += Number(r.metrics.clicks);
    d.impressions += Number(r.metrics.impressions); d.leads += Math.round(Number(r.metrics.conversions));
  }
  function send(body) {
    UrlFetchApp.fetch("${url}/ads", { method: "post", contentType: "application/json",
      headers: { Authorization: "Bearer ${key}" }, payload: JSON.stringify(body) });
  }
  ["google", "lsa"].forEach(function (src) {
    var days = Object.keys(by[src]).map(function (k) { return by[src][k]; });
    if (days.length) send({ source: src, days: days });
  });
  // Keywords and the searches people actually typed, last 30 days.
  var kw = [], kr = AdsApp.search("SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, campaign.name, " +
    "metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM keyword_view " +
    "WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0");
  while (kr.hasNext()) { var k = kr.next(); kw.push({ text: k.adGroupCriterion.keyword.text, match: k.adGroupCriterion.keyword.matchType,
    campaign: k.campaign.name, clicks: Number(k.metrics.clicks), impressions: Number(k.metrics.impressions),
    cost: Number(k.metrics.costMicros) / 1e6, conversions: Number(k.metrics.conversions) }); }
  var st = [], sr = AdsApp.search("SELECT search_term_view.search_term, metrics.clicks, metrics.impressions, metrics.cost_micros, " +
    "metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0 " +
    "ORDER BY metrics.clicks DESC LIMIT 300");
  while (sr.hasNext()) { var t = sr.next(); st.push({ text: t.searchTermView.searchTerm, clicks: Number(t.metrics.clicks),
    impressions: Number(t.metrics.impressions), cost: Number(t.metrics.costMicros) / 1e6, conversions: Number(t.metrics.conversions) }); }
  send({ source: "google_keywords", days: 30, keywords: kw, terms: st });
}`;
}
