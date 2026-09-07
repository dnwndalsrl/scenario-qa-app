import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectUiState } from "./ui-audit-collector";
let browser: Awaited<ReturnType<typeof chromium.launch>>;
beforeAll(async()=>{ browser=await chromium.launch({headless:true}); }); afterAll(async()=>{ await browser.close(); });
describe("UI audit rules",()=>{
  it("detects deterministic overflow, clipping, target size, contrast, and overlap issues",async()=>{
    const page=await browser.newPage({viewport:{width:390,height:844}}); await page.setContent(`<style>body{margin:0}.wide{width:600px}.clip{width:40px;white-space:nowrap;overflow:hidden}.tiny{display:block;width:12px;height:12px;padding:0}.contrast{color:rgb(120,120,120);background:rgb(130,130,130)}.covered{position:absolute;left:100px;top:200px;width:100px;height:40px}.cover{position:absolute;z-index:2;left:100px;top:200px;width:100px;height:40px;background:white}</style><div class="wide">wide</div><div class="clip">content that is clipped</div><button class="tiny">x</button><p class="contrast">low contrast</p><button class="covered">target</button><div class="cover">cover</div>`);
    const rules=(await inspectUiState(page,"initial")).map((item)=>item.rule);
    expect(rules).toEqual(expect.arrayContaining(["horizontal_overflow","clipped_content","small_target","low_contrast","element_overlap"])); await page.close();
  });
  it("ignores hidden helpers, carousel containers, uncertain backgrounds, and card overlay links",async()=>{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent(`<style>
      body{margin:0;color:rgb(0,0,0);background:rgb(255,255,255)}
      .visually-hidden{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden}
      .carousel{width:100px;overflow:hidden}.track{width:300px}
      .hero{background-image:linear-gradient(rgb(0,0,0),rgb(0,0,0))}.hero span{color:rgb(255,255,255)}
      .floating{position:fixed;top:0;background:transparent}.floating a{color:rgb(255,255,255)}
      .card{position:relative;width:200px;height:100px;margin-top:100px}.card>a{position:absolute;inset:0;z-index:2}.card h3{color:rgb(0,0,0)}
    </style>
    <a class="visually-hidden" href="#content">Skip to content</a>
    <div class="carousel"><div class="track"><span>Intentional carousel content</span></div></div>
    <section class="hero"><span>Text over an image</span></section>
    <header class="floating"><a href="/menu">Transparent navigation</a></header>
    <ul><li class="card"><a href="/card"></a><div><h3>Clickable card title</h3></div></li></ul>`);
    expect(await inspectUiState(page,"initial")).toEqual([]);
    await page.close();
  });
});
