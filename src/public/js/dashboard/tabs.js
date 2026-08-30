import { setGlobalMessage } from "./ui-status.js";

var tabButtons = null;
var historyPanel = null;
var usersPanel = null;
var devicesPanel = null;
var topNav = null;
var globalMessageEl = null;

export function initTabs(deps) {
  topNav = deps.topNav;
  tabButtons = deps.tabButtons;
  historyPanel = deps.historyPanel;
  usersPanel = deps.usersPanel;
  devicesPanel = deps.devicesPanel;
  globalMessageEl = deps.globalMessageEl;

  topNav.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    var tabName = target.getAttribute("data-tab");
    if (!tabName) {
      return;
    }
    activateTab(tabName);
  });
}

export function activateTab(tabName) {
  tabButtons.forEach(function (btn) {
    var active = btn.getAttribute("data-tab") === tabName;
    btn.classList.toggle("active", active);
  });

  historyPanel.classList.toggle("active", tabName === "history");
  usersPanel.classList.toggle("active", tabName === "users");
  devicesPanel.classList.toggle("active", tabName === "devices");
  setGlobalMessage(globalMessageEl, "", false);
}