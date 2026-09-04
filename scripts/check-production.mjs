const productionUrl = process.argv[2];

if (!productionUrl) {
  console.error("Production URL is required.");
  process.exit(1);
}

const paths = ["/api/health", "/login"];

try {
  const results = await Promise.all(paths.map(async (path) => {
    const url = new URL(path, productionUrl);
    const response = await fetch(url, { redirect: "manual" });
    const loginRedirect = path === "/login" && response.status >= 300 && response.status < 400;
    if (!response.ok && !loginRedirect) throw new Error(`${path} returned ${response.status}`);
    return `${path} ${response.status}`;
  }));
  console.log(results.join(", "));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
