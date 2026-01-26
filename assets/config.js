export const CONFIG = {
  // Use local YAML file
  cardsYamlUrl: "./arcsbasegame.yml",

  // The YAML has `image: BC01` etc; we render `${cardImagesBaseUrl}${image}.png`
  cardImagesBaseUrl:
    "https://raw.githubusercontent.com/buriedgiantstudios/cards/master/content/card-images/arcs/en-US/",

  // Google Sheets may redirect to login unless the file is accessible without auth.
  // Even if “Anyone with the link” is enabled, client-side fetch can still be blocked.
  // If this URL redirects to a login page, use File → Share → Publish to web and paste
  // the published CSV URL here.
  sheetCsvUrl:
    "https://docs.google.com/spreadsheets/d/13Wb-JoX7L2-o3Q-ejvepsx11MW--yhTN5oJ-I4Hp2DU/export?format=csv&gid=1136087345",

  // Name of the column in the sheet that contains the card name.
  // If unknown, we will guess from headers.
  preferredNameColumns: ["Card", "Card Name", "Name"],

  // Only show cards with any of these tags. Leave empty to show everything.
  // Example: ["Base Court", "Lore", "Leader"]
  includeAnyTags: [],
};
