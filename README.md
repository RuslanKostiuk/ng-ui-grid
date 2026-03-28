# ng-ui-grid

Angular grid workspace with:

- publishable library package: [`@rkostiuk/ng-ui-grid`](https://www.npmjs.com/package/@rkostiuk/ng-ui-grid)
- local demo app for development and feature validation

Repository: [github.com/RuslanKostiuk/ng-ui-grid](https://github.com/RuslanKostiuk/ng-ui-grid)

## Workspace

Library source:

- [projects/ng-ui-grid/src/lib/ui-grid.component.ts](/Users/rkostiuk/Desktop/my/ng-ui-grid/projects/ng-ui-grid/src/lib/ui-grid.component.ts)
- [projects/ng-ui-grid/src/lib/grid-types.ts](/Users/rkostiuk/Desktop/my/ng-ui-grid/projects/ng-ui-grid/src/lib/grid-types.ts)

Package entrypoint:

- [projects/ng-ui-grid/src/public-api.ts](/Users/rkostiuk/Desktop/my/ng-ui-grid/projects/ng-ui-grid/src/public-api.ts)

Demo app:

- [src/app/app.component.ts](/Users/rkostiuk/Desktop/my/ng-ui-grid/src/app/app.component.ts)

## Install

```bash
npm install @rkostiuk/ng-ui-grid
```

## Import

```ts
import { UiGridComponent, GridColumn } from '@rkostiuk/ng-ui-grid';
```

## Basic Usage

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiGridComponent, GridColumn } from '@rkostiuk/ng-ui-grid';

interface UserRow {
  id: number;
  name: string;
  company: string;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [UiGridComponent],
  template: `
    <app-ui-grid
      [columns]="columns"
      [rows]="rows"
      [pageSize]="25">
    </app-ui-grid>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent {
  columns: GridColumn<UserRow>[] = [
    { id: 'id', header: 'ID', field: 'id', width: '6rem', disableHide: true },
    { id: 'name', header: 'Name', field: 'name', editable: true },
    { id: 'company', header: 'Company', field: 'company' },
  ];

  rows: UserRow[] = [
    { id: 1, name: 'Lena Harper', company: 'Northwind' },
    { id: 2, name: 'Maksym Koval', company: 'Blue Harbor' },
  ];
}
```

## Features

- sortable headers
- header filters
- infinite scroll
- virtualized row rendering
- server-side paging/filtering/sorting hooks
- column show/hide
- drag-and-drop column reorder
- drag-out column hide
- resizable columns with min/max constraints
- inline editing
- row context menu
- grid main menu
- custom header, filter, and cell templates
- CSS variable based style customization

## Component API

Selector:

```html
<app-ui-grid></app-ui-grid>
```

### Inputs

`columns: GridColumn<T>[]`

- Required.
- Defines column structure, behavior, visibility, templates, editing, and rendering.

`rows: T[]`

- Client-side row set.
- Used when `dataSource` is not provided.

`dataSource?: GridDataSource<T>`

- Enables server mode.
- Receives `{ page, pageSize, sort, filters }`.
- Should return `{ rows, total?, hasMore? }`.

`pageSize = 40`

- Number of rows fetched or revealed per increment.

`infiniteScroll = true`

- Enables incremental client/server paging while scrolling.

`emptyMessage = 'No rows matched the current grid state.'`

- Displayed when no rows are available.

`themeVars: Record<string, string>`

- CSS custom properties applied to the grid root.
- Primary styling API for consumers.

`mainMenuItems: GridMenuItems<T>`

- Custom actions for the top-right grid menu.

`contextMenuItems: GridMenuItems<T>`

- Custom row context-menu actions.

`trackBy?: (index: number, row: T) => unknown`

- Custom tracking function for row rendering.

### Outputs

`sortChanged: GridSort | null`

- Fires when sorting changes or is cleared.

`filterChanged: GridFilters`

- Fires when filter state changes.

`columnVisibilityChanged: { columnId: string; visible: boolean }`

- Fires when a column is shown or hidden.

`columnResizeFinished: { columnId, width, widthPx }`

- Fires when column resize drag ends.

`cellEdited: { row, columnId, previousValue, value }`

- Fires when inline cell editing commits a new value.

## Column API

`GridColumn<T>`

- `id: string`
- `header: string`
- `field?: keyof T & string`
- `sortable?: boolean` default `false`
- `filterable?: boolean` default `true`
- `resizable?: boolean` default `true`
- `editable?: boolean`
- `editorType?: 'text' | 'number'`
- `visible?: boolean`
- `disableHide?: boolean`
- `width?: string`
- `minWidth?: string`
- `maxWidth?: string`
- `filterPlaceholder?: string`
- `headerTemplate?: TemplateRef<GridHeaderTemplateContext<T>>`
- `filterTemplate?: TemplateRef<GridFilterTemplateContext<T>>`
- `cellTemplate?: TemplateRef<GridCellTemplateContext<T>>`
- `valueGetter?: (row: T) => unknown`
- `valueSetter?: (row: T, value: unknown) => void`
- `cellRenderer?: (row: T) => string`

### Column behavior

- `field` is the default value source.
- `valueGetter` lets you derive display/sort/filter values.
- `valueSetter` lets inline editing write back into complex row models.
- `width`, `minWidth`, and `maxWidth` accept CSS sizes such as `180px`, `12rem`, or `20%`.
- `resizable` controls whether the header shows a drag handle for column resizing.
- `cellRenderer` is for string output.
- `cellTemplate` is for custom markup.
- `headerTemplate` and `filterTemplate` let you fully customize header/filter UI.

## Template Renderer Contexts

`GridHeaderTemplateContext<T>`

- `column`
- `sort`
- `sortIndicator`
- `toggleSort()`

`GridFilterTemplateContext<T>`

- `column`
- `value`
- `setValue(value: string)`

`GridCellTemplateContext<T>`

- `row`
- `column`
- `value`
- `text`
- `startEdit()`

## Server Mode

Pass a `dataSource` function:

```ts
const dataSource = async ({ page, pageSize, sort, filters }) => {
  const result = await api.getUsers({ page, pageSize, sort, filters });

  return {
    rows: result.items,
    total: result.total,
    hasMore: result.hasMore,
  };
};
```

```html
<app-ui-grid
  [columns]="columns"
  [dataSource]="dataSource">
</app-ui-grid>
```

## Menus

Both menus accept either:

- a static array of menu items
- or a function that receives a menu context

`GridMenuContext<T>` exposes:

- `row?`
- `rows`
- `visibleColumns`
- `sort`
- `filters`
- `refresh()`
- `clearFilters()`
- `setFilter(columnId, value)`
- `setSort(sort)`
- `toggleColumn(columnId)`

## Inline Editing

- Double-click an editable cell to start editing.
- `Enter` or blur commits.
- `Escape` cancels.
- `cellEdited` is emitted after commit.

For editable derived values, provide `valueSetter`.

## Styling

Pass `themeVars`:

```ts
themeVars = {
  '--ui-grid-accent': '#0f766e',
  '--ui-grid-header-bg': 'linear-gradient(180deg, rgba(15,118,110,0.12), rgba(15,118,110,0.04)), #f7fffd',
  '--ui-grid-row-hover-bg': 'rgba(15, 118, 110, 0.08)',
  '--ui-grid-radius': '14px',
};
```

```html
<app-ui-grid
  [columns]="columns"
  [rows]="rows"
  [themeVars]="themeVars">
</app-ui-grid>
```

Supported CSS variables:

- `--ui-grid-radius`
- `--ui-grid-surface`
- `--ui-grid-header-bg`
- `--ui-grid-border`
- `--ui-grid-divider`
- `--ui-grid-shadow`
- `--ui-grid-text`
- `--ui-grid-text-strong`
- `--ui-grid-muted`
- `--ui-grid-muted-strong`
- `--ui-grid-accent`
- `--ui-grid-row-alt-bg`
- `--ui-grid-row-hover-bg`
- `--ui-grid-input-border`
- `--ui-grid-input-bg`
- `--ui-grid-menu-bg`
- `--ui-grid-error`

## Development

Run demo app:

```bash
npm start
```

Build demo app:

```bash
npm run build
```

Build library:

```bash
npm run build:lib
```

Dry-run npm package:

```bash
cd dist/ng-ui-grid
npm pack --dry-run
```

## Publish

```bash
npm run build:lib
cd dist/ng-ui-grid
npm publish --access public
```
