import { TemplateRef } from '@angular/core';

export type GridSortDirection = 'asc' | 'desc';
export type GridEditorType = 'text' | 'number';

export interface GridSort {
  columnId: string;
  direction: GridSortDirection;
}

export type GridFilters = Record<string, string>;

export interface GridHeaderTemplateContext<T> {
  column: GridColumn<T>;
  sort: GridSort | null;
  sortIndicator: string;
  toggleSort: () => void;
}

export interface GridFilterTemplateContext<T> {
  column: GridColumn<T>;
  value: string;
  setValue: (value: string) => void;
}

export interface GridCellTemplateContext<T> {
  row: T;
  column: GridColumn<T>;
  value: unknown;
  text: string;
  startEdit: () => void;
}

export interface GridColumn<T> {
  id: string;
  header: string;
  field?: keyof T & string;
  sortable?: boolean;
  filterable?: boolean;
  editable?: boolean;
  editorType?: GridEditorType;
  visible?: boolean;
  disableHide?: boolean;
  width?: string;
  filterPlaceholder?: string;
  headerTemplate?: TemplateRef<GridHeaderTemplateContext<T>>;
  filterTemplate?: TemplateRef<GridFilterTemplateContext<T>>;
  cellTemplate?: TemplateRef<GridCellTemplateContext<T>>;
  valueGetter?: (row: T) => unknown;
  valueSetter?: (row: T, value: unknown) => void;
  cellRenderer?: (row: T) => string;
}

export interface GridColumnVisibilityChange {
  columnId: string;
  visible: boolean;
}

export interface GridCellEdit<T> {
  row: T;
  columnId: string;
  previousValue: unknown;
  value: unknown;
}

export interface GridPageRequest {
  page: number;
  pageSize: number;
  sort: GridSort | null;
  filters: GridFilters;
}

export interface GridPageResult<T> {
  rows: T[];
  total?: number;
  hasMore?: boolean;
}

export interface GridMenuContext<T> {
  row?: T;
  rows: T[];
  visibleColumns: GridColumn<T>[];
  sort: GridSort | null;
  filters: GridFilters;
  refresh: () => void;
  clearFilters: () => void;
  setFilter: (columnId: string, value: string) => void;
  setSort: (sort: GridSort | null) => void;
  toggleColumn: (columnId: string) => void;
}

export interface GridMenuItem<T> {
  id: string;
  label: string;
  action: (context: GridMenuContext<T>) => void;
  disabled?: boolean | ((context: GridMenuContext<T>) => boolean);
  hidden?: boolean | ((context: GridMenuContext<T>) => boolean);
}

export type GridMenuItems<T> =
  | GridMenuItem<T>[]
  | ((context: GridMenuContext<T>) => GridMenuItem<T>[]);

export type GridDataSource<T> =
  (request: GridPageRequest) => GridPageResult<T> | Promise<GridPageResult<T>>;
