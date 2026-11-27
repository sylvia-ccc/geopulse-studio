import {describe,it,expect} from "vitest";
import {buildGeoJsonLd,buildLlmsTxt} from "@/lib/geo/schema";
import type {BrandProfile} from "@/types/geo";
describe("Public metadata evidence boundaries",()=>{
  it("does not infer an Offer from years, price ranges, or mixed-currency free text",()=>{
    const brand={id:"b",name:"Example",companyName:"Example",productName:"Example",category:"Software",oneLiner:"Documented software",websiteUrl:"https://example.com",targetAudience:"Agencies",pricingInfo:"2026 plans: CNY 299 and USD 99, contact for enterprise"} as BrandProfile;
    const data=JSON.parse(buildGeoJsonLd({title:"Pricing explanation",slug:"explanation",summary:"Scope",directAnswerCapsule:"Scope",targetKeyword:"software",faqs:[],brand,baseUrl:"https://example.com"}));
    expect(data['@graph'].find((node:Record<string,unknown>)=>node['@type']==='Product').offers).toBeUndefined();
  });
  it("describes the llms index without claiming universal fact checking or indexing",()=>{
    const text=buildLlmsTxt({brands:[],articles:[],baseUrl:"https://example.com"});
    expect(text).not.toContain("fact-checked");expect(text).not.toContain("explicitly permitted to index and cite");
    expect(text).toContain("do not establish factual accuracy");
  });
});
