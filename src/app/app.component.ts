import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  GridCellEdit,
  GridCellTemplateContext,
  GridColumn,
  GridDataSource,
  GridFilterTemplateContext,
  GridFilters,
  GridHeaderTemplateContext,
  GridMenuItems,
  GridPageRequest,
  GridPageResult,
  GridSort,
  UiGridComponent,
} from '@ruslankostiuk/ng-ui-grid';

interface CustomerRow {
  id: number;
  customer: string;
  company: string;
  city: string;
  country: string;
  segment: string;
  balance: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, UiGridComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly customerHeaderTemplate = viewChild<TemplateRef<unknown>>('customerHeader');
  private readonly segmentFilterTemplate = viewChild<TemplateRef<unknown>>('segmentFilter');
  private readonly countryCellTemplate = viewChild<TemplateRef<unknown>>('countryCell');

  protected readonly customerColumns = computed<GridColumn<CustomerRow>[]>(() => [
    { id: 'id', header: 'ID', field: 'id', width: '6rem', filterable: true, disableHide: true },
    {
      id: 'customer',
      header: 'Customer',
      field: 'customer',
      width: '15rem',
      editable: true,
      headerTemplate: this.customerHeaderTemplate() as
        | TemplateRef<GridHeaderTemplateContext<CustomerRow>>
        | undefined,
    },
    { id: 'company', header: 'Company', field: 'company', width: '16rem', editable: true },
    { id: 'city', header: 'City', field: 'city', width: '12rem', editable: true },
    {
      id: 'country',
      header: 'Country',
      field: 'country',
      width: '10rem',
      cellTemplate: this.countryCellTemplate() as
        | TemplateRef<GridCellTemplateContext<CustomerRow>>
        | undefined,
    },
    {
      id: 'segment',
      header: 'Segment',
      field: 'segment',
      width: '10rem',
      editable: true,
      filterTemplate: this.segmentFilterTemplate() as
        | TemplateRef<GridFilterTemplateContext<CustomerRow>>
        | undefined,
    },
    {
      id: 'balance',
      header: 'Balance',
      field: 'balance',
      width: '8rem',
      editable: true,
      editorType: 'number',
      cellRenderer: (row) => `$${row.balance.toLocaleString()}`,
    },
  ]);

  protected readonly localRows = createCustomerRows(600);
  protected readonly serverRows = createCustomerRows(1200);
  protected readonly gridColumns = computed(() =>
    this.customerColumns() as GridColumn<unknown>[],
  );
  protected readonly gridLocalRows = this.localRows as unknown[];
  protected readonly demoThemeVars = {
    '--ui-grid-accent': '#2f79d0',
    '--ui-grid-header-bg': 'linear-gradient(180deg, rgba(10, 61, 145, 0.12), rgba(10, 61, 145, 0.05)), #f8fbff',
    '--ui-grid-row-hover-bg': 'rgba(83, 160, 255, 0.12)',
    '--ui-grid-radius': '18px',
  };

  protected readonly mainMenuItems: GridMenuItems<CustomerRow> = [
    {
      id: 'refresh',
      label: 'Refresh grid',
      action: (context) => {
        this.pushEvent('Main menu requested refresh');
        context.refresh();
      },
    },
    {
      id: 'clear-filters',
      label: 'Clear filters',
      action: (context) => {
        this.pushEvent('Main menu cleared filters');
        context.clearFilters();
      },
    },
    {
      id: 'sort-balance-desc',
      label: 'Sort balance desc',
      action: (context) => {
        this.pushEvent('Main menu sorted by balance desc');
        context.setSort({ columnId: 'balance', direction: 'desc' });
      },
    },
  ];

  protected readonly contextMenuItems: GridMenuItems<CustomerRow> = (context) => [
    {
      id: 'inspect',
      label: 'Inspect row',
      action: () => {
        if (context.row) {
          this.pushEvent(`Context menu inspected ${context.row.customer}`);
        }
      },
    },
    {
      id: 'filter-country',
      label: 'Filter same country',
      action: () => {
        if (context.row) {
          this.pushEvent(`Context menu filtered country ${context.row.country}`);
          context.setFilter('country', context.row.country);
        }
      },
    },
    {
      id: 'toggle-company',
      label: 'Toggle company column',
      action: () => {
        this.pushEvent('Context menu toggled company column');
        context.toggleColumn('company');
      },
    },
  ];

  protected readonly serverDataSource: GridDataSource<CustomerRow> = async (
    request: GridPageRequest,
  ): Promise<GridPageResult<CustomerRow>> => {
    await delay(250);

    const filtered = applyFilters(this.serverRows, this.customerColumns(), request.filters);
    const sorted = applySort(filtered, this.customerColumns(), request.sort);
    const startIndex = request.page * request.pageSize;
    const endIndex = startIndex + request.pageSize;

    return {
      rows: sorted.slice(startIndex, endIndex),
      total: sorted.length,
      hasMore: endIndex < sorted.length,
    };
  };
  protected readonly gridMainMenuItems = this.mainMenuItems as GridMenuItems<unknown>;
  protected readonly gridContextMenuItems = this.contextMenuItems as GridMenuItems<unknown>;
  protected readonly gridServerDataSource = this.serverDataSource as GridDataSource<unknown>;

  protected readonly eventLog = signal<string[]>([
    'Grid events appear here.',
  ]);

  protected onSortChange(source: string, sort: GridSort | null): void {
    const state = sort ? `${sort.columnId} ${sort.direction}` : 'cleared';
    this.pushEvent(`${source}: sort ${state}`);
  }

  protected onFilterChange(source: string, filters: GridFilters): void {
    const activeFilters = Object.entries(filters)
      .filter(([, value]) => value.trim())
      .map(([column, value]) => `${column}=${value}`)
      .join(', ') || 'cleared';

    this.pushEvent(`${source}: filters ${activeFilters}`);
  }

  protected onColumnToggle(source: string, columnId: string, visible: boolean): void {
    this.pushEvent(`${source}: column ${columnId} ${visible ? 'shown' : 'hidden'}`);
  }

  protected onCellEdit(source: string, event: GridCellEdit<unknown>): void {
    this.pushEvent(`${source}: edited ${event.columnId} -> ${event.value}`);
  }

  private pushEvent(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.eventLog.update((items) => [`${timestamp} - ${message}`, ...items].slice(0, 8));
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function createCustomerRows(count: number): CustomerRow[] {
  const firstNames = ['Lena', 'Maksym', 'Olivia', 'Theo', 'Emma', 'Noah', 'Mia', 'Lucas'];
  const lastNames = ['Harper', 'Koval', 'Nguyen', 'Bennett', 'Silva', 'Khan', 'Fischer', 'Mills'];
  const companies = ['Northwind', 'Blue Harbor', 'Summit Ops', 'Riverside Labs', 'Nova Retail'];
  const cities = ['Kyiv', 'Berlin', 'London', 'Warsaw', 'Toronto', 'Austin', 'Madrid'];
  const countries = ['Ukraine', 'Germany', 'United Kingdom', 'Poland', 'Canada', 'USA', 'Spain'];
  const segments = ['Enterprise', 'SMB', 'Startup', 'Public'];

  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    customer: `${firstNames[index % firstNames.length]} ${lastNames[index % lastNames.length]}`,
    company: companies[index % companies.length],
    city: cities[index % cities.length],
    country: countries[index % countries.length],
    segment: segments[index % segments.length],
    balance: 1200 + ((index * 173) % 9000),
  }));
}

function applyFilters(
  rows: CustomerRow[],
  columns: GridColumn<CustomerRow>[],
  filters: GridFilters,
): CustomerRow[] {
  return rows.filter((row) =>
    Object.entries(filters).every(([columnId, filterValue]) => {
      const normalized = filterValue.trim().toLowerCase();
      if (!normalized) {
        return true;
      }

      const column = columns.find((item) => item.id === columnId);
      const value = readColumnValue(row, column);
      return String(value ?? '').toLowerCase().includes(normalized);
    }),
  );
}

function applySort(
  rows: CustomerRow[],
  columns: GridColumn<CustomerRow>[],
  sort: GridSort | null,
): CustomerRow[] {
  if (!sort) {
    return rows;
  }

  const column = columns.find((item) => item.id === sort.columnId);
  if (!column) {
    return rows;
  }

  const multiplier = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = readColumnValue(left, column);
    const rightValue = readColumnValue(right, column);

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * multiplier;
    }

    return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * multiplier;
  });
}

function readColumnValue(row: CustomerRow, column?: GridColumn<CustomerRow>): unknown {
  if (!column) {
    return '';
  }

  if (column.valueGetter) {
    return column.valueGetter(row);
  }

  if (column.field) {
    return row[column.field];
  }

  return row[column.id as keyof CustomerRow];
}
