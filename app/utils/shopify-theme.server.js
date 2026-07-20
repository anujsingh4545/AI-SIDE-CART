export async function getThemeData(admin) {
  try {
    const res = await admin.graphql(`#graphql
      query GetActiveTheme {
        themes(first: 1, roles: [MAIN]) {
          nodes {
            id
            name
            role
            files(filenames: ["config/settings_data.json"]) {
              nodes {
                filename
                body {
                  ... on OnlineStoreThemeFileBodyText {
                    content
                  }
                }
              }
            }
          }
        }
      }
    `);

    const { data } = await res.json();
    const theme = data?.themes?.nodes?.[0];
    if (!theme) return null;

    const fileContent = theme.files?.nodes?.[0]?.body?.content;
    const settings = fileContent ? JSON.parse(fileContent) : null;

    return {
      id: theme.id,
      name: theme.name,
      settings: settings?.current ?? null,  // raw key-value map of all theme settings
    };
  } catch (e) {
    console.error("[shopify-theme]", e?.message ?? e);
    return null;
  }
}
