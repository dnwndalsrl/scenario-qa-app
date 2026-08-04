export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  components: [{ path: "~/components", pathPrefix: false }],
  css: ["element-plus/dist/index.css", "~/assets/scss/main.scss"],
  typescript: { strict: true, typeCheck: true },
  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    githubToken: process.env.GITHUB_ACTIONS_TOKEN ?? "",
    githubOwner: process.env.GITHUB_OWNER ?? "",
    githubRepo: process.env.GITHUB_REPOSITORY ?? process.env.GITHUB_REPO ?? "",
    githubWorkflowId: process.env.GITHUB_WORKFLOW_FILE ?? process.env.GITHUB_WORKFLOW_ID ?? "run-qa-analysis.yml",
    githubWorkflowRef: process.env.GITHUB_DEPLOY_BRANCH ?? process.env.GITHUB_WORKFLOW_REF ?? "main",
    public: {
      pollingIntervalMs: 3000,
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      signupEnabled: process.env.NUXT_PUBLIC_SIGNUP_ENABLED === "true",
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3100"
    }
  },
  nitro: {
    preset: process.env.VERCEL ? "vercel" : "node-server",
    // Keep the bundle self-contained where possible, and trace any runtime-only
    // imports so Vercel includes them in the serverless function package.
    externals: { trace: true, inline: [/.*/] }
  },
  app: {
    head: {
      title: "Probe QA · URL 기반 AI 웹 QA",
      meta: [{ name: "description", content: "URL을 등록하면 GitHub Actions 실행기가 안전한 웹 QA 분석을 수행합니다." }]
    }
  }
});
