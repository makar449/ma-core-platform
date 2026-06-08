export type MetricKind = "counter" | "gauge";

export interface MetricSnapshot {
  readonly name: string;
  readonly kind: MetricKind;
  readonly value: number;
  readonly labels: Readonly<Record<string, string>>;
  readonly updatedAt: string;
}

interface StoredMetric {
  kind: MetricKind;
  value: number;
  labels: Readonly<Record<string, string>>;
  updatedAt: number;
}

export class MetricsRegistry {
  private readonly metrics = new Map<string, StoredMetric>();

  public increment(name: string, labels: Readonly<Record<string, string>> = {}, amount = 1): void {
    this.assertMetricName(name);
    this.assertMetricAmount(amount);
    const key = this.metricKey(name, labels);
    const current = this.metrics.get(key);
    this.metrics.set(key, {
      kind: "counter",
      value: (current?.value ?? 0) + amount,
      labels: { ...labels },
      updatedAt: Date.now()
    });
  }

  public setGauge(name: string, value: number, labels: Readonly<Record<string, string>> = {}): void {
    this.assertMetricName(name);
    this.assertMetricAmount(value);
    const key = this.metricKey(name, labels);
    this.metrics.set(key, { kind: "gauge", value, labels: { ...labels }, updatedAt: Date.now() });
  }

  public list(retentionSeconds: number): MetricSnapshot[] {
    const cutoff = Date.now() - retentionSeconds * 1000;
    const snapshots: MetricSnapshot[] = [];
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.updatedAt < cutoff) {
        this.metrics.delete(key);
        continue;
      }
      snapshots.push({
        name: key.split("|")[0] ?? key,
        kind: metric.kind,
        value: metric.value,
        labels: metric.labels,
        updatedAt: new Date(metric.updatedAt).toISOString()
      });
    }
    return snapshots.sort((left, right) => left.name.localeCompare(right.name));
  }

  public toPrometheusText(retentionSeconds: number): string {
    return this.list(retentionSeconds).map((metric) => {
      const labelPairs = Object.entries(metric.labels).sort(([left], [right]) => left.localeCompare(right));
      const labels = labelPairs.length > 0
        ? `{${labelPairs.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(",")}}`
        : "";
      return `${metric.name}${labels} ${metric.value}`;
    }).join("\n");
  }

  private metricKey(name: string, labels: Readonly<Record<string, string>>): string {
    const normalizedLabels = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
    return `${name}|${normalizedLabels.map(([key, value]) => `${key}=${value}`).join("|")}`;
  }

  private assertMetricName(name: string): void {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
      throw new Error(`Metric name ${name} is invalid`);
    }
  }

  private assertMetricAmount(value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error("Metric value must be finite");
    }
  }
}
