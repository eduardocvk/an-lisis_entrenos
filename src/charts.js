import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);
export function chart(
  el,
  {
    labels = [],
    series = [],
    yName = '',
    scatter = false,
    inverse = false,
    zoom = false,
    sessionsForPoint,
    onOpenSession,
  },
) {
  const instance = echarts.init(el);
  instance.setOption({
    color: ['#5b63d3', '#ec7955', '#d5a742', '#4386c5'],
    textStyle: { fontFamily: 'system-ui', color: '#596078', fontSize: 14 },
    tooltip: {
      trigger: scatter ? 'item' : 'axis',
      renderMode: 'html',
      enterable: true,
      confine: true,
      hideDelay: 500,
      formatter: (input) => {
        const points = Array.isArray(input) ? input : [input];
        const root = document.createElement('div');
        root.className = 'session-tooltip';
        const heading = document.createElement('strong');
        heading.textContent = points[0]?.axisValueLabel || points[0]?.name || yName;
        root.append(heading);
        for (const point of points) {
          const value = Array.isArray(point.value) ? point.value.at(-1) : point.value;
          const row = document.createElement('div');
          row.textContent = `${point.seriesName}: ${value == null ? '—' : typeof value === 'number' ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : value} ${yName}`;
          root.append(row);
        }
        if (sessionsForPoint) {
          const sessions = new Map(points.flatMap((p) => sessionsForPoint(p)).map((a) => [a.id, a]));
          const list = document.createElement('div');
          list.className = 'tooltip-sessions';
          for (const a of [...sessions.values()].sort((a, b) => a.start.localeCompare(b.start))) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(a.start))} · ${a.name}`;
            button.addEventListener('click', (e) => {
              e.stopPropagation();
              onOpenSession?.(a.id);
            });
            list.append(button);
          }
          if (!sessions.size) {
            const text = document.createElement('small');
            text.textContent = 'Sin sesiones asociadas';
            list.append(text);
          }
          root.append(list);
        }
        return root;
      },
    },
    legend: { show: series.length > 1, bottom: 0, type: 'scroll' },
    grid: { left: 58, right: 24, top: 30, bottom: zoom ? 85 : 65 },
    xAxis: scatter
      ? { type: 'value', name: 'Pulso medio (ppm)', nameLocation: 'middle', nameGap: 30 }
      : { type: 'category', data: labels, axisLabel: { hideOverlap: true } },
    yAxis: {
      type: 'value',
      name: yName,
      inverse,
      scale: true,
      splitLine: { lineStyle: { color: '#edf1ef' } },
      axisLabel: { formatter: (v) => Number(v.toFixed(2)) },
    },
    dataZoom: zoom ? [{ type: 'inside' }, { type: 'slider', bottom: 28, height: 16 }] : [],
    series: series.map((s) => ({
      type: scatter ? 'scatter' : 'line',
      smooth: false,
      showSymbol: scatter,
      symbolSize: scatter ? 10 : 5,
      connectNulls: false,
      ...s,
    })),
  });
  const observer = new ResizeObserver(() => instance.resize());
  observer.observe(el);
  return {
    instance,
    destroy() {
      observer.disconnect();
      instance.dispose();
    },
  };
}
