"use strict";

(() => {
  let snapshot = {};
  let lastContent;
  const byId = id => document.getElementById(id);
  const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const businessDay = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  });
  let displayedRoomDay;
  const blank = "—";

  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value != null) node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function parts(value, unit = "") {
    if (!Number.isFinite(value)) return [blank, ""];
    if (Math.abs(value) >= 100000000) return [number.format(value / 100000000), "亿" + unit];
    if (Math.abs(value) >= 10000) return [number.format(value / 10000), "万" + unit];
    return [number.format(value), unit];
  }

  function quantity(value, unit = "") {
    return parts(value, unit).join("");
  }

  const overview = [
    ["shopCount", "合作商家数量"],
    ["payOrders", "支付订单量"], ["deliveryOrders", "发货订单量"],
    ["settleOrders", "结算订单量"], ["payGmv", "支付GMV"],
    ["deliveryGmv", "发货GMV"], ["settleGmv", "结算GMV"]
  ];
  function businessChange(value) {
    const row = element("div", null, "delta");
    const hasValue = Number.isFinite(value);
    const magnitude = hasValue ? number.format(Math.abs(value)) + "%" : blank;
    const amount = element("span", magnitude, hasValue ? "rise" : "");
    if (hasValue) {
      const svgNamespace = "http://www.w3.org/2000/svg";
      const arrow = document.createElementNS(svgNamespace, "svg");
      arrow.setAttribute("class", "trend-arrow");
      arrow.setAttribute("viewBox", "0 0 10 10");
      arrow.setAttribute("aria-hidden", "true");
      arrow.setAttribute("focusable", "false");
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute("d", "M5 9V1M1 5l4-4 4 4");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.4");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      arrow.appendChild(path);
      amount.prepend(arrow);
    }
    row.append(element("span", "环比幅度"), amount);
    return row;
  }

  function showOverview() {
    byId("snapshot-time").textContent = snapshot.generatedAt || "待接入";
    const period = snapshot.summaryPeriod;
    const available = period?.days === 30 && period.source === "baiying_business_detail";
    byId("summary-title").title = available ? "近30天：" + period.start + " 至 " + period.end : "近30天数据待采集";
    const boxes = overview.map(([key, name]) => {
      const metric = (available && snapshot.summary?.[key]) || {};
      const box = element("article", null, "metric");
      const text = element("div", null, "metric-text");
      const label = element("div", null, "label");
      label.append(element("span", name));
      const [digits, suffix] = parts(metric.value);
      const prefix = key.endsWith("Gmv") && Number.isFinite(metric.value) ? "¥" : "";
      const figure = element("strong");
      figure.append(element("span", prefix), element("span", digits), element("small", suffix));
      text.append(label, figure, businessChange(metric.changePct));
      box.append(text);
      if (key !== "shopCount" && Number.isFinite(metric.value)) {
        const trend = element("img", null, "metric-trend");
        trend.width = 76;
        trend.height = 40;
        trend.src = "business-trend.png";
        trend.alt = "";
        box.append(trend);
      }
      return box;
    });
    byId("overview-grid").replaceChildren(...boxes);
  }

  function merchantLabel(logoUrl, label) {
    const identity = element("div", null, "merchant-label");
    if (logoUrl) {
      const logo = element("img", null, "merchant-logo");
      logo.alt = "";
      logo.addEventListener("error", () => logo.remove(), { once: true });
      logo.src = logoUrl;
      identity.append(logo);
    }
    identity.append(label);
    return identity;
  }

  function shopMetric(shop, key, unit) {
    const cell = element("td");
    if ((shop.authorized !== true && shop.dataSource !== "simulated") || !Number.isFinite(shop[key])) {
      if (shop.authorized === false) cell.title = "店铺未授权经营数据";
      return cell;
    }
    const actual = element("strong", quantity(shop[key], unit));
    actual.title = number.format(shop[key]) + unit;
    cell.append(actual);
    const pct = shop[key + "ChangePct"];
    if (Number.isFinite(pct)) {
      const label = (pct > 0 ? "+" : "") + number.format(pct) + "%";
      cell.append(element("small", "环比 " + label, "delta " + (pct < 0 ? "negative" : "positive")));
    }
    return cell;
  }

  function shopRow(shop) {
    const row = element("tr");
    const name = element("td");
    const label = element("div");
    label.append(element("strong", shop.name || blank), element("small", shop.id ? "ID " + shop.id : blank));
    name.append(merchantLabel(shop.logoUrl, label));
    row.append(name, element("td", shop.score ?? ""));
    for (const key of ["payGmv", "deliveryGmv", "settleGmv"]) row.append(shopMetric(shop, key, "元"));
    for (const key of ["payOrders", "deliveryOrders", "settleOrders"]) row.append(shopMetric(shop, key, "单"));
    return row;
  }

  function roomCard(room) {
    const card = element("article", null, "room");
    const title = element("div", null, "room-title");
    title.append(merchantLabel(room.logoUrl, element("b", room.shopName || room.title || blank)),
      element("small", "开播 " + (room.startTime || blank)));
    const metrics = element("dl");
    for (const [label, value, unit] of [
      ["用户支付", room.payGmv, "元"], ["浏览量", room.watchCount, ""], ["千次观看支付", room.perThousandGmv, "元"]
    ]) {
      const group = element("div");
      group.append(element("dt", label), element("dd", quantity(value, unit)));
      metrics.append(group);
    }
    card.append(title);
    if (room.title && room.title !== room.shopName) card.append(element("p", room.title, "room-meta"));
    card.append(metrics);
    return card;
  }

  function shopPlaceholder() {
    const row = element("tr");
    const cell = element("td", "暂无商家数据", "muted");
    cell.colSpan = 8;
    row.append(cell);
    return row;
  }

  function pager(pageSize, target, counter, previous, next, render, placeholder) {
    let page = 0;
    let pages = 1;
    let items = [];
    function show(step) {
      page = (page + step + pages) % pages;
      const rows = items.slice(page * pageSize, (page + 1) * pageSize);
      byId(target).replaceChildren(...(rows.length ? rows.map(render) : [placeholder()]));
      byId(counter).textContent = (page + 1) + " / " + pages;
    }
    for (const [id, step] of [[previous, -1], [next, 1]]) {
      const button = byId(id);
      button.addEventListener("click", () => { show(step); resetTimer(); });
    }
    return {
      advance() { if (pages > 1) show(1); },
      replace(rows) {
        items = rows;
        pages = Math.max(1, Math.ceil(items.length / pageSize));
        page = Math.min(page, pages - 1);
        byId(previous).disabled = byId(next).disabled = pages === 1;
        show(0);
      }
    };
  }

  const shopPager = pager(4, "shop-rows", "shops-page", "prev-shop", "next-shop", shopRow, shopPlaceholder);
  const roomPager = pager(3, "room-list", "rooms-page", "prev-room", "next-room", roomCard,
    () => element("p", snapshot.liveAt?.slice(0, 10) === displayedRoomDay ? "当前无在播直播间" : "今日在播数据待更新", "muted"));

  function renderRooms(day) {
    displayedRoomDay = day;
    roomPager.replace(snapshot.liveAt?.slice(0, 10) === day ? snapshot.liveRooms || [] : []);
  }

  function render() {
    showOverview();
    const period = snapshot.shopPeriod;
    const label = byId("shop-period");
    const knownRange = period?.days === 30 && period.start && period.end;
    label.textContent = knownRange ? "近30天 · 截至" + period.end.slice(5).replace("-", "/") : "";
    label.title = knownRange ? period.start + " 至 " + period.end : "";
    shopPager.replace(snapshot.shops || []);
    renderRooms(businessDay.format(new Date()));
  }

  function applySnapshot(data) {
    const timestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
    const records = rows => Array.isArray(rows) && rows.every(row => row && typeof row === "object" && !Array.isArray(row));
    if (!data || !(data.generatedAt === "" || timestamp(data.generatedAt)) ||
        ![data.summaryAt, data.shopsAt, data.liveAt].every(value => value == null || timestamp(value)) ||
        !overview.every(([key]) => data.summary?.[key] &&
          (data.summary[key].value === null || Number.isFinite(data.summary[key].value))) ||
        !records(data.shops) || !records(data.liveRooms)) return false;
    if (snapshot.generatedAt && data.generatedAt < snapshot.generatedAt) return true;
    const content = JSON.stringify(data);
    if (content !== lastContent) {
      snapshot = data;
      lastContent = content;
      render();
    }
    return true;
  }

  function readSnapshotScript() {
    // A classic script works with file:// where fetch of a neighboring file is blocked.
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "snapshot.js?refresh=" + Date.now();
      const timeout = setTimeout(() => finish(false), 5000);
      function finish(ok) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        script.remove();
        if (ok) resolve(window.DASHBOARD_SNAPSHOT);
        else reject(new Error("无法读取本地快照"));
      }
      script.onload = () => finish(true);
      script.onerror = () => finish(false);
      document.head.append(script);
    });
  }

  let refreshing = false;
  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try {
      if (location.protocol !== "file:" && !location.hostname.endsWith(".github.io")) {
        try {
          const response = await fetch("/api/v1/display", { cache: "no-store", signal: AbortSignal.timeout(5000) });
          if (response.ok && applySnapshot(await response.json())) return;
        } catch { /* A standalone static server can still serve snapshot.js. */ }
      }
      applySnapshot(await readSnapshotScript());
    } catch { /* Retain the last rendered batch until the next successful read. */ }
    finally {
      refreshing = false;
      const day = businessDay.format(new Date());
      if (day !== displayedRoomDay) renderRooms(day);
      window.renderMonthly(snapshot.monthlyAssessment, snapshot.quarterlyAssessment);
    }
  }

  if (!applySnapshot(window.DASHBOARD_SNAPSHOT)) render();
  window.renderMonthly(snapshot.monthlyAssessment, snapshot.quarterlyAssessment);

  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let timer;
  function resetTimer() {
    clearInterval(timer);
    const button = byId("rotation");
    button.textContent = paused ? "继续轮播" : "暂停轮播";
    button.setAttribute("aria-pressed", String(paused));
    if (!paused && !document.hidden) timer = setInterval(() => { shopPager.advance(); roomPager.advance(); }, 5000);
  }
  byId("rotation").addEventListener("click", () => { paused = !paused; resetTimer(); });
  document.addEventListener("visibilitychange", () => { resetTimer(); refresh(); });
  window.addEventListener("online", refresh);
  setInterval(refresh, 30000);
  resetTimer();
  refresh();
})();
