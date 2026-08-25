(function () {
  var loginForm = document.getElementById("loginForm");
  var errorText = document.getElementById("loginError");

  if (!loginForm || !errorText) {
    return;
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var formData = new FormData(loginForm);
    var username = String(formData.get("username") || "").trim();
    var password = String(formData.get("password") || "");

    errorText.textContent = "";

    try {
      var response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: username, password: password })
      });

      var result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "فشل تسجيل الدخول");
      }

      localStorage.setItem("token", result.token);
      localStorage.setItem("user", JSON.stringify(result.user));
      window.location.href = "/dashboard";
    } catch (error) {
      errorText.textContent = error instanceof Error ? error.message : "فشل تسجيل الدخول";
    }
  });
})();
