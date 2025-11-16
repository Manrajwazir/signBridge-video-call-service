const AI_URL = import.meta.env.VITE_AI_URL || "http://localhost:8000";

export async function postFrameToAI(base64) {
  const res = await fetch(`${AI_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64 })
  });
  return res.json();
}