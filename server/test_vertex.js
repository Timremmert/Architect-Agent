import { GoogleGenAI } from '@google/genai';
try {
  let ai = new GoogleGenAI({ vertexai: { project: "abc", location: "eu" } });
  console.log("Nested worked.");
} catch (e) {
  console.log("Nested failed:", e.message);
}

try {
  let ai2 = new GoogleGenAI({ project: "abc", location: "eu", vertexai: true });
  console.log("Root worked.");
} catch (e) {
  console.log("Root failed:", e.message);
}
