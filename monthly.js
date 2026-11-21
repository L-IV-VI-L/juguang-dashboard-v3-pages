(() => {
  "use strict";

  const metrics = [
    { id: "gmv", label: "本月支付GMV", unit: "元", defaultTarget: 1_000_000, hideTarget: true },
    { id: "highValueBrands", label: "发货高价值品牌数", unit: "个" },
    { id: "qianchuanVideos", label: "千川短视频数量", unit: "条", defaultTarget: 1_000, hideTarget: true },
    { id: "settledOrders", label: "结算订单量", unit: "单", defaultTarget: 20_000, hideTarget: true }
  ];

  const numbers = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const percentages = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
  const completion = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, useGrouping: false });
  const calendar = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  });

  function amount(value, unit) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    if (unit !== "元" && !Number.isSafeInteger(value)) return null;
    return value;
  }

  function quantity(value, unit) {
    if (value === null) return "—";
    if (unit === "元" && value >= 10000) {
      return numbers.format(value / 10000) + "万" + unit;
    }
    return numbers.format(value) + unit;
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function progressTrack(rate) {
    const track = element("div", "track");
    track.setAttribute("aria-hidden", "true");
    if (Number.isFinite(rate)) {
      const fill = element("i");
      fill.style.width = Math.min(100, rate) + "%";
      track.append(fill);
    }
    return track;
  }

  function quarterCard(label, unit, values) {
    const actual = amount(values?.actual, unit);
    const target = amount(values?.target, unit);
    const rate = values?.completionPct;
    const validRate = actual !== null && target > 0 && Number.isFinite(rate) && rate >= 0 ? rate : null;
    const card = element("article", "assessment");
    const main = element("div", "assessment-main");
    const figure = element("strong", "", quantity(actual, unit));
    if (actual !== null) figure.title = "已完成 " + numbers.format(actual) + unit;
    main.append(figure);
    const meta = element("div", "assessment-meta");
    meta.append(element("span", "", target === null ? "目标未提供" : "目标 " + quantity(target, unit)),
      element("span", "", "完成度 " + (validRate === null ? "—" : completion.format(validRate) + "%")));
    card.append(element("h3", "", label), main, progressTrack(validRate), meta);
    return card;
  }

  function isCalendarQuarter(startDate, endDate) {
    const start = new Date(startDate + "T00:00:00Z");
    const month = start.getUTCMonth();
    return start.getUTCDate() === 1 && month % 3 === 0
      && new Date(Date.UTC(start.getUTCFullYear(), month + 3, 0)).toISOString().slice(0, 10) === endDate;
  }

  window.renderMonthly = function renderMonthly(report, quarter) {
    const grid = document.getElementById("assessments");
    const period = document.getElementById("assess-period");
    const quarterGroup = document.getElementById("quarter-group");
    const quarterGrid = document.getElementById("quarter-assessments");
    if (!grid || !period || !quarterGroup || !quarterGrid) return;

    const date = Object.fromEntries(calendar.formatToParts(new Date()).map(part => [part.type, part.value]));
    const month = date.year + "-" + date.month;
    const today = month + "-" + date.day;
    const activeQuarter = quarter?.metrics && quarter.periodStart <= today && today <= quarter.periodEnd;
    quarterGroup.hidden = !activeQuarter;
    if (activeQuarter) {
      const title = isCalendarQuarter(quarter.periodStart, quarter.periodEnd) ? "季度考核" : "驾驶舱考核";
      document.getElementById("quarter-title").textContent = title;
      const sameYear = quarter.periodStart.slice(0, 4) === quarter.periodEnd.slice(0, 4);
      const endDate = sameYear ? quarter.periodEnd.slice(5) : quarter.periodEnd;
      const range = quarter.periodStart.replaceAll("-", "/") + "–" + endDate.replaceAll("-", "/");
      const through = quarter.asOf ? " · 截至" + quarter.asOf.slice(5, 10).replace("-", "/") : "";
      document.getElementById("quarter-period").textContent = range + through;
      quarterGrid.replaceChildren(quarterCard("发货GMV", "元", quarter.metrics.deliveryGmv),
        quarterCard("发货高价值品牌数", "个", quarter.metrics.highValueBrands));
    } else {
      quarterGrid.replaceChildren();
    }
    const collected = report?.month === month ? report : null;
    const manual = window.MONTHLY_ASSESSMENT?.month === month ? window.MONTHLY_ASSESSMENT : null;
    const end = collected?.periodEnd;
    const cutoff = typeof end === "string" && end.startsWith(month + "-") ? " · 截至" + end.slice(5).replace("-", "/") : "";
    period.textContent = date.year + "年" + date.month + "月" + cutoff;

    const cards = [];
    for (const metric of metrics) {
      const measured = collected?.metrics?.[metric.id];
      const supplied = manual?.metrics?.[metric.id];
      const target = amount(measured?.target, metric.unit) ?? amount(supplied?.target, metric.unit)
        ?? metric.defaultTarget ?? null;
      const actual = amount(measured?.actual, metric.unit) ?? amount(supplied?.actual, metric.unit);
      if (activeQuarter && metric.id === "highValueBrands" && actual === null && target === null) continue;
      const rate = target > 0 && actual !== null ? actual * 100 / target : null;
      const hasRate = Number.isFinite(rate);
      const rateAsFigure = hasRate && !metric.hideTarget;

      const card = element("article", "assessment");
      const main = element("div", "assessment-main");
      const figure = element("strong", "", rateAsFigure ? percentages.format(rate) + "%" : quantity(actual, metric.unit));
      if (actual !== null) figure.title = "已完成 " + numbers.format(actual) + metric.unit;
      main.append(figure, element("span", "", rateAsFigure ? "达成率" : actual === null ? "本月数据未提供" : "已完成"));
      card.append(element("h3", "", metric.label), main);
      const meta = element("div", "assessment-meta");
      if (metric.hideTarget) {
        if (hasRate) meta.append(element("span", "", "完成度 " + completion.format(rate) + "%"));
      } else {
        meta.append(element("span", "", target === null ? "目标未提供" : "目标 " + quantity(target, metric.unit)));
        if (hasRate) meta.append(element("span", "", "已完成 " + quantity(actual, metric.unit)));
      }
      card.append(progressTrack(rate), meta);
      cards.push(card);
    }
    grid.replaceChildren(...cards);
  };
})();
