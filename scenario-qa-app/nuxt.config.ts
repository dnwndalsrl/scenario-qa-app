export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  components: [{ path: "~/components", pathPrefix: false }],
  css: ["~/assets/scss/main.scss"],
  typescript: { strict: true, typeCheck: true },
  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    githubToken: process.env.GITHUB_ACTIONS_TOKEN ?? "",
    githubOwner: process.env.GITHUB_OWNER ?? "",
    githubRepo: process.env.GITHUB_REPOSITORY ?? process.env.GITHUB_REPO ?? "",
    githubWorkflowId: process.env.GITHUB_WORKFLOW_FILE ?? process.env.GITHUB_WORKFLOW_ID ?? "run-qa-analysis.yml",
    githubWorkflowRef: process.env.GITHUB_DEPLOY_BRANCH ?? process.env.GITHUB_WORKFLOW_REF ?? "main",
    dispatchRecoverySecret: process.env.DISPATCH_RECOVERY_SECRET ?? process.env.CRON_SECRET ?? "",
    analysisCredentialEncryptionKey: process.env.ANALYSIS_CREDENTIAL_ENCRYPTION_KEY ?? "",
    public: {
      pollingIntervalMs: 3000,
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      signupEnabled: process.env.NUXT_PUBLIC_SIGNUP_ENABLED === "true",
      reviewerEmail: process.env.NUXT_PUBLIC_REVIEWER_EMAIL ?? "qa-admin@scenario-qa.app",
      reviewerPassword: process.env.NUXT_PUBLIC_REVIEWER_PASSWORD ?? "",
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3100"
    }
  },
  nitro: {
    preset: process.env.VERCEL ? "vercel" : "node-server",
    serverAssets: [{ baseName: "pdf-fonts", dir: "server/assets/pdf-fonts" }],
    // Keep the bundle self-contained where possible, and trace any runtime-only
    // imports so Vercel includes them in the serverless function package.
    externals: { trace: true, inline: [/.*/] }
  },
  app: {
    head: {
      title: "Probe QA · URL 기반 AI 웹 QA",
      meta: [{ name: "description", content: "URL을 등록하면 페이지를 분석하고 검토 가능한 웹 QA 시나리오를 생성합니다." }]
    }
  }
});

