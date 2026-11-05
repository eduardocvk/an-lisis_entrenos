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
  { labels = [], series = [], yName = '', scatter = false, inverse = false, zoom = false },
) {
  const instance = echarts.init(el);
  instance.setOption({
    color: ['#087f79', '#d88c43', '#7787b4', '#d06078'],
    textStyle: { fontFamily: 'system-ui', color: '#667976' },
    tooltip: { trigger: scatter ? 'item' : 'axis', renderMode: 'richText' },
    legend: { bottom: 0, type: 'scroll' },
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
