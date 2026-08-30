import { state } from "./state.js";

export function initAuth(userBadgeEl, logoutBtn) {
  var token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login";
    return false;
  }

  state.token = token;

  var user = null;
  try {
    var rawUser = localStorage.getItem("user");
    user = rawUser ? JSON.parse(rawUser) : null;
  } catch (_error) {
    user = null;
  }

  if (!user) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    state.token = null;
    state.user = null;
    state.isAdmin = false;
    state.roleLabel = "";
    window.location.href = "/login";
    return false;
  }

  state.user = user;
  state.isAdmin = user.role === "admin";
  state.roleLabel = user.role === "admin" ? "مدير" : "موظف";

  userBadgeEl.textContent = user.name + " (" + state.roleLabel + ")";

  if (!state.isAdmin) {
    document.querySelectorAll(".admin-only").forEach(function (el) {
      el.classList.add("hidden");
    });
  }

  logoutBtn.addEventListener("click", function () {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    state.token = null;
    state.user = null;
    state.isAdmin = false;
    state.roleLabel = "";
    window.location.href = "/login";
  });

  return true;
}