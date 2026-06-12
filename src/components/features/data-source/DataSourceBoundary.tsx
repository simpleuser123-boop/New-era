import type { ReactNode } from "react";

export type DataSourceKind =
  | "demo"
  | "fallback"
  | "local"
  | "model"
  | "online"
  | "temporary";

export function getDataSourceLabel(_kind: DataSourceKind): string {
  void _kind;
  return "";
}

export function formatDataSourceList(_kinds: DataSourceKind[]): string {
  void _kinds;
  return "";
}

export function DataSourceBadge(_props: {
  className?: string;
  kind: DataSourceKind;
  label?: string;
}) {
  void _props;
  return null;
}

export function DataSourceNotice(_props: {
  className?: string;
  description: ReactNode;
  sources: DataSourceKind[];
  title?: string;
  tone?: "info" | "neutral" | "success" | "warning";
}) {
  void _props;
  return null;
}
