async function loadQuestions() {
  const res = await fetch("./2024.json", { cache: "no-store" });
  return await res.json();
}
