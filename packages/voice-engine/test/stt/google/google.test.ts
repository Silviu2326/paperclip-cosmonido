import { describe, expect, it } from "vitest";
import { createGoogleSttProvider } from "../../../src/stt/providers/google/index.js";
import { VoiceEngineError } from "../../../src/core/errors.js";

describe("Google Chirp 3",()=>{
 it("uses access token auth and maps word offsets/speakers",async()=>{let init:RequestInit|undefined;const provider=createGoogleSttProvider({credentials:{accessToken:"token",projectId:"p",location:"us"},fetch:async(_u,i)=>{init=i;return new Response(JSON.stringify({results:[{languageCode:"en-US",resultEndOffset:"2s",alternatives:[{transcript:"hello",words:[{word:"hello",startOffset:"0.2s",endOffset:"0.8s",speakerLabel:"1"}]}]}],metadata:{requestId:"rid"}}),{status:200});}});const result=await provider.transcribe({audio:{data:new Uint8Array([1]),mimeType:"audio/wav"},wordTimestamps:true,diarization:{enabled:true}});expect((init?.headers as Record<string,string>).authorization).toBe("Bearer token");expect(result.words?.[0]).toMatchObject({text:"hello",startMs:200,endMs:800,speaker:"1"});});
 it("maps HTTP errors",async()=>{const p=createGoogleSttProvider({credentials:{apiKey:"key",projectId:"p",location:"us"},fetch:async()=>new Response("{}",{status:429,headers:{"retry-after":"3"}})});await expect(p.transcribe({audio:{data:new Uint8Array([1]),mimeType:"audio/wav"}})).rejects.toMatchObject<Partial<VoiceEngineError>>({code:"rate_limit",retryAfterMs:3000});});
});
