// ==========================================
// CONFIGURATION LOAD
// ==========================================
function loadConfig() {
  const fm = FileManager.iCloud();
  const dir = fm.documentsDirectory();
  const configPath = fm.joinPath(dir, "config.json");

  if (!fm.fileExists(configPath)) {
    throw new Error("config.json not found! Copy config.template.json to config.json and fill in your keys.");
  }

  // Ensure file is downloaded from iCloud before reading
  fm.downloadFileFromiCloud(configPath);
  const raw = fm.readString(configPath);
  return JSON.parse(raw);
}

const CONFIG = loadConfig();
const CLIENT_ID = CONFIG.CLIENT_ID;
const CLIENT_SECRET = CONFIG.CLIENT_SECRET;
const REFRESH_TOKEN = CONFIG.REFRESH_TOKEN; // Needed for user playlist modification
const PLAYLIST_ID = CONFIG.PLAYLIST_ID;
const RSS_FEED_URL = CONFIG.RSS_FEED_URL;

// ==========================================
// MAIN WORKFLOW
// ==========================================
async function main() {
  console.log("Starting Podcast Sync...");

  // 1. Fetch RSS Feed
  const rssReq = new Request(RSS_FEED_URL);
  const rssXml = await rssReq.loadString();
  const episodeTitle = extractLatestTitle(rssXml);

  if (!episodeTitle) {
    console.log("Could not extract episode title from RSS feed.");
    return;
  }
  console.log(`Latest Episode: "${episodeTitle}"`);

  // 2. Get User Access Token via Refresh Token
  const token = await getSpotifyUserToken();
  if (!token) {
    console.log("Failed to obtain Spotify user token.");
    return;
  }

  // 3. Search Spotify for Episode URI
  const episodeUri = await searchEpisode(token, episodeTitle);
  if (!episodeUri) {
    console.log("Episode not found on Spotify.");
    return;
  }
  console.log(`Found Spotify Episode URI: ${episodeUri}`);

  // 4. Add Episode to Spotify Playlist
  const success = await addToPlaylist(token, PLAYLIST_ID, episodeUri);
  if (success) {
    console.log("Successfully added episode to playlist!");
  } else {
    console.log("Failed to add episode to playlist.");
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Parse the first <title> tag inside the <item> block from the RSS XML
function extractLatestTitle(xml) {
  const match = xml.match(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
  return match ? match[1].trim() : null;
}

// Obtain Access Token with user permissions using Refresh Token
async function getSpotifyUserToken() {
  const req = new Request("https://accounts.spotify.com/api/token");
  req.method = "POST";
  
  const credentials = `${CLIENT_ID}:${CLIENT_SECRET}`;
  const base64Auth = Data.fromString(credentials).toBase64String();

  req.headers = {
    "Authorization": `Basic ${base64Auth}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  req.body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH_TOKEN)}`;

  const json = await req.loadJSON();
  if (json.error) {
    console.log(`Auth Error: ${json.error_description || json.error}`);
    return null;
  }
  return json.access_token || null;
}

// Search Spotify API for episode by name
async function searchEpisode(token, title) {
  const query = encodeURIComponent(title);
  const req = new Request(`https://api.spotify.com/v1/search?q=${query}&type=episode&limit=1`);
  req.headers = { "Authorization": `Bearer ${token}` };

  const json = await req.loadJSON();
  const items = json.episodes?.items;
  return (items && items.length > 0) ? items[0].uri : null;
}

// Append Track/Episode URI to Playlist
async function addToPlaylist(token, playlistId, episodeUri) {
  const req = new Request(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
  req.method = "POST";
  req.headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  req.body = JSON.stringify({ uris: [episodeUri] });

  const res = await req.loadJSON();
  return !res.error;
}

// Execute Scriptable Process
await main();
Script.complete();
