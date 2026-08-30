import { state } from "./state.js";
import { apiRequest } from "./api.js";
import { setGlobalMessage } from "./ui-status.js";

var usersTableBody = null;
var userForm = null;
var userIdInput = null;
var userNameInput = null;
var userUsernameInput = null;
var userPasswordInput = null;
var userRoleInput = null;
var userSaveBtn = null;
var userCancelBtn = null;
var userFormMessage = null;
var globalMessageEl = null;

export function initUserManagement(deps) {
  usersTableBody = deps.usersTableBody;
  userForm = deps.userForm;
  userIdInput = deps.userIdInput;
  userNameInput = deps.userNameInput;
  userUsernameInput = deps.userUsernameInput;
  userPasswordInput = deps.userPasswordInput;
  userRoleInput = deps.userRoleInput;
  userSaveBtn = deps.userSaveBtn;
  userCancelBtn = deps.userCancelBtn;
  userFormMessage = deps.userFormMessage;
  globalMessageEl = deps.globalMessageEl;

  userForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!state.isAdmin) {
      setGlobalMessage(globalMessageEl, "فقط المدير يمكنه إدارة المستخدمين", true);
      return;
    }

    var payload = {
      name: userNameInput.value.trim(),
      username: userUsernameInput.value.trim(),
      password: userPasswordInput.value,
      role: userRoleInput.value
    };

    try {
      if (state.editingUserId) {
        var updatePayload = {
          name: payload.name,
          username: payload.username,
          role: payload.role
        };
        if (payload.password) {
          updatePayload.password = payload.password;
        }
        await apiRequest("/api/users/" + state.editingUserId, {
          method: "PUT",
          body: JSON.stringify(updatePayload)
        });
        setGlobalMessage(globalMessageEl, "تم تحديث المستخدم بنجاح", false);
      } else {
        if (!payload.password) {
          throw new Error("كلمة المرور مطلوبة عند إنشاء مستخدم جديد");
        }
        await apiRequest("/api/users", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setGlobalMessage(globalMessageEl, "تم إنشاء المستخدم بنجاح", false);
      }

      resetUserForm();
      await loadUsers();
    } catch (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل حفظ المستخدم", true);
    }
  });

  userCancelBtn.addEventListener("click", function () {
    resetUserForm();
  });
}

export function resetUserForm() {
  state.editingUserId = null;
  userIdInput.value = "";
  userNameInput.value = "";
  userUsernameInput.value = "";
  userPasswordInput.value = "";
  userRoleInput.value = "emp";
  userSaveBtn.textContent = "إضافة مستخدم";
  userFormMessage.textContent = "";
}

export async function loadUsers() {
  try {
    var users = await apiRequest("/api/users");
    usersTableBody.innerHTML = "";

    users.forEach(function (u) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        u.id +
        "</td><td>" +
        u.name +
        "</td><td>" +
        u.username +
        "</td><td>" +
        u.role +
        "</td>";

      if (state.isAdmin) {
        var actionTd = document.createElement("td");
        actionTd.className = "action-buttons";

        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "ghost-btn";
        editBtn.textContent = "تعديل";
        editBtn.addEventListener("click", function () {
          state.editingUserId = u.id;
          userIdInput.value = String(u.id);
          userNameInput.value = u.name;
          userUsernameInput.value = u.username;
          userRoleInput.value = u.role;
          userPasswordInput.value = "";
          userSaveBtn.textContent = "تحديث مستخدم";
          userFormMessage.textContent = "تعديل المستخدم رقم " + u.id;
        });

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "danger-btn";
        deleteBtn.textContent = "حذف";
        deleteBtn.addEventListener("click", async function () {
          if (!window.confirm("هل تريد حذف المستخدم " + u.username + "؟")) {
            return;
          }
          try {
            await apiRequest("/api/users/" + u.id, { method: "DELETE" });
            if (Number(state.editingUserId) === Number(u.id)) {
              resetUserForm();
            }
            await loadUsers();
            setGlobalMessage(globalMessageEl, "تم حذف المستخدم بنجاح", false);
          } catch (error) {
            setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل الحذف", true);
          }
        });

        actionTd.appendChild(editBtn);
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);
      }

      usersTableBody.appendChild(tr);
    });
  } catch (error) {
    usersTableBody.innerHTML = "";
    setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل تحميل المستخدمين", true);
  }
}