# @rkostiuk/ng-ui-grid

Reusable Angular grid library with:

- sorting
- header filters
- infinite scroll
- server-side paging/filtering hooks
- column show/hide
- drag-and-drop column reordering
- resizable columns with min/max constraints
- inline editing
- custom header, filter, and cell templates
- CSS variable based styling

## Install

```bash
npm install @rkostiuk/ng-ui-grid
```

## Import

```ts
import { UiGridComponent, GridColumn } from '@rkostiuk/ng-ui-grid';
```

## Basic usage

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
    { id: 'id', header: 'ID', field: 'id', width: '6rem', minWidth: '5rem', sortable: true, disableHide: true },
    { id: 'name', header: 'Name', field: 'name', editable: true, sortable: true },
    { id: 'company', header: 'Company', field: 'company' },
  ];

  rows: UserRow[] = [
    { id: 1, name: 'Lena Harper', company: 'Northwind' },
    { id: 2, name: 'Maksym Koval', company: 'Blue Harbor' },
  ];
}
```

## Styling

Pass `themeVars` to override the default look with CSS custom properties:

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

## Column behavior

- `sortable` defaults to `false`
- `filterable` defaults to `true`
- `resizable` defaults to `true`
- `width`, `minWidth`, and `maxWidth` accept CSS size strings

## Events

- `sortChanged`
- `filterChanged`
- `columnVisibilityChanged`
- `columnResizeFinished`
- `cellEdited`

Supported variables include:

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

## Publishing

Build the package:

```bash
npm run build:lib
```

Review the publish payload:

```bash
cd dist/ng-ui-grid
npm pack --dry-run
```

Publish:

```bash
cd dist/ng-ui-grid
npm publish --access public
```
