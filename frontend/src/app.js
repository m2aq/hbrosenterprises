const healthBox = document.getElementById("health-box");

async function boot() {
  try {
    const response = await fetch("http://localhost:8080/api/health");
    const data = await response.json();
    healthBox.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    healthBox.textContent = JSON.stringify(
      {
        ok: false,
        message: "No se pudo conectar a la API local. Inicia backend con npm run dev.",
        error: String(error)
      },
      null,
      2
    );
  }
}

boot();
