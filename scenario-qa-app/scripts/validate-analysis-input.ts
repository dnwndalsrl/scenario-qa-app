import { analysisIdFromArgs } from "./analysis-id";
analysisIdFromArgs(process.argv.slice(2));
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[name]) throw new Error(`${name} is required`);
console.log("Runner input and required environment are valid.");
