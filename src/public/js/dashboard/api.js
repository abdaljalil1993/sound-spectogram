import { state } from "./state.js";

export async function apiRequest(path, options) {
  var requestOptions = options || {};
  var headers = requestOptions.headers || {};
  headers.Authorization = "Bearer " + state.token;

  if (requestOptions.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  var response = await fetch(path, {
    method: requestOptions.method || "GET",
    headers: {
      Authorization: headers.Authorization,
      "Content-Type": headers["Content-Type"] || undefined
    },
    body: requestOptions.body
  });

  var data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (response.status === 401) {
    console.error("Redirect triggered by: 401 response. state.token value:", state.token, "path:", path);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    throw new Error("انتهت الجلسة");
  }

  if (!response.ok) {
    throw new Error((data && data.message) || "فشل تنفيذ الطلب");
  }

  return data;
}
