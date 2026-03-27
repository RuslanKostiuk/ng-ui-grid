import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgStyle, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  GridColumn,
  GridCellEdit,
  GridColumnResizeFinished,
  GridColumnVisibilityChange,
  GridCellTemplateContext,
  GridDataSource,
  GridFilters,
  GridFilterTemplateContext,
  GridHeaderTemplateContext,
  GridMenuContext,
  GridMenuItem,
  GridMenuItems,
  GridPageRequest,
  GridPageResult,
  GridSort,
} from './grid-types';

interface ContextMenuState {
  x: number;
  y: number;
  row: unknown;
  items: GridMenuItem<unknown>[];
}

interface EditingCellState {
  row: unknown;
  columnId: string;
  draftValue: string;
}

interface ColumnResizeState {
  columnId: string;
  startX: number;
  startWidthPx: number;
  minWidthPx: number;
  maxWidthPx: number;
}

@Component({
  selector: 'app-ui-grid',
  standalone: true,
  imports: [FormsModule, NgStyle, NgTemplateOutlet],
  templateUrl: './ui-grid.component.html',
  styleUrl: './ui-grid.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiGridComponent implements AfterViewInit, OnDestroy {
  readonly columns = input.required<GridColumn<unknown>[]>();
  readonly rows = input<unknown[]>([]);
  readonly dataSource = input<GridDataSource<unknown> | undefined>(undefined);
  readonly pageSize = input(40);
  readonly infiniteScroll = input(true);
  readonly emptyMessage = input('No rows matched the current grid state.');
  readonly themeVars = input<Record<string, string>>({});
  readonly mainMenuItems = input<GridMenuItems<unknown>>([]);
  readonly contextMenuItems = input<GridMenuItems<unknown>>([]);
  readonly trackBy = input<((index: number, row: unknown) => unknown) | undefined>(undefined);

  readonly sortChanged = output<GridSort | null>();
  readonly filterChanged = output<GridFilters>();
  readonly columnVisibilityChanged = output<GridColumnVisibilityChange>();
  readonly columnResizeFinished = output<GridColumnResizeFinished>();
  readonly cellEdited = output<GridCellEdit<unknown>>();

  @ViewChild('bodyScroller') private bodyScroller?: ElementRef<HTMLDivElement>;
  @ViewChild('gridFrame') private gridFrame?: ElementRef<HTMLElement>;

  protected readonly internalColumns = signal<GridColumn<unknown>[]>([]);
  protected readonly filterState = signal<GridFilters>({});
  protected readonly sortState = signal<GridSort | null>(null);
  protected readonly displayedRows = signal<unknown[]>([]);
  protected readonly totalCount = signal<number | undefined>(undefined);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly showMainMenu = signal(false);
  protected readonly resolvedMainMenuItems = signal<GridMenuItem<unknown>[]>([]);
  protected readonly contextMenu = signal<ContextMenuState | undefined>(undefined);
  protected readonly draggingColumnId = signal<string | null>(null);
  protected readonly dragOverColumnId = signal<string | null>(null);
  protected readonly dragOverSide = signal<'before' | 'after' | null>(null);
  protected readonly previewColumnOrder = signal<string[] | null>(null);
  protected readonly resizingColumnId = signal<string | null>(null);
  protected readonly editingCell = signal<EditingCellState | undefined>(undefined);
  protected readonly visibleColumns = computed(() =>
    this.internalColumns().filter((column) => column.visible ?? true),
  );
  protected readonly renderedColumns = computed(() => {
    const orderedColumns = this.orderColumns(this.internalColumns(), this.previewColumnOrder());
    return orderedColumns.filter((column) => column.visible ?? true);
  });

  protected readonly defaultTrackBy = (index: number, row: unknown): unknown =>
    this.trackBy()?.(index, row) ?? row;

  private processedClientRows: unknown[] = [];
  private nextPage = 0;
  private filterTimer?: number;
  private afterRenderTimer?: number;
  private viewReady = false;
  private dragDroppedInsideGrid = false;
  private resizeState?: ColumnResizeState;

  constructor() {
    effect(() => {
      const incomingColumns = this.columns();
      this.syncColumns(incomingColumns);
      untracked(() => this.resetGrid());
    });

    effect(() => {
      this.rows();
      this.dataSource();
      this.pageSize();
      this.infiniteScroll();
      untracked(() => this.resetGrid());
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.scheduleFillCheck();
  }

  ngOnDestroy(): void {
    if (this.filterTimer) {
      window.clearTimeout(this.filterTimer);
    }

    if (this.afterRenderTimer) {
      window.clearTimeout(this.afterRenderTimer);
    }
  }

  @HostListener('document:mousemove', ['$event'])
  protected onDocumentMouseMove(event: MouseEvent): void {
    if (!this.resizeState) {
      return;
    }

    const widthPx = this.clampWidth(
      this.resizeState.startWidthPx + (event.clientX - this.resizeState.startX),
      this.resizeState.minWidthPx,
      this.resizeState.maxWidthPx,
    );

    this.internalColumns.update((columns) =>
      columns.map((column) =>
        column.id === this.resizeState?.columnId
          ? { ...column, width: `${Math.round(widthPx)}px` }
          : column,
      ),
    );
  }

  @HostListener('document:mouseup')
  protected onDocumentMouseUp(): void {
    if (!this.resizeState) {
      return;
    }

    const column = this.internalColumns().find((item) => item.id === this.resizeState?.columnId);
    if (column?.width) {
      this.columnResizeFinished.emit({
        columnId: column.id,
        width: column.width,
        widthPx: this.toPixels(column.width, this.resizeState.startWidthPx),
      });
    }

    this.resizeState = undefined;
    this.resizingColumnId.set(null);
  }

  protected toggleSort(column: GridColumn<unknown>): void {
    if (!column.sortable) {
      return;
    }

    const currentSort = this.sortState();
    if (currentSort?.columnId !== column.id) {
      this.sortState.set({ columnId: column.id, direction: 'asc' });
    } else if (currentSort.direction === 'asc') {
      this.sortState.set({ columnId: column.id, direction: 'desc' });
    } else {
      this.sortState.set(null);
    }

    this.sortChanged.emit(this.sortState());
    this.resetGrid();
  }

  protected onFilterInput(columnId: string, value: string): void {
    this.filterState.update((state) => ({
      ...state,
      [columnId]: value,
    }));

    if (this.filterTimer) {
      window.clearTimeout(this.filterTimer);
    }

    this.filterTimer = window.setTimeout(() => {
      this.filterChanged.emit({ ...this.filterState() });
      this.resetGrid();
    }, 180);
  }

  protected onBodyScroll(event: Event): void {
    const target = event.target as HTMLDivElement;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 96) {
      this.loadMore();
    }
  }

  protected toggleMainMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.contextMenu.set(undefined);
    const nextValue = !this.showMainMenu();
    this.showMainMenu.set(nextValue);

    if (nextValue) {
      this.resolvedMainMenuItems.set(this.buildMenuItems(this.mainMenuItems()));
    }
  }

  protected runMainMenuItem(item: GridMenuItem<unknown>): void {
    item.action(this.buildMenuContext());
    this.showMainMenu.set(false);
  }

  protected openContextMenu(event: MouseEvent, row: unknown): void {
    event.preventDefault();
    event.stopPropagation();

    const items = this.buildMenuItems(this.contextMenuItems(), row);
    if (!items.length) {
      return;
    }

    this.showMainMenu.set(false);
    this.contextMenu.set({
      x: event.clientX,
      y: event.clientY,
      row,
      items,
    });
  }

  protected runContextMenuItem(item: GridMenuItem<unknown>, row: unknown): void {
    item.action(this.buildMenuContext(row));
    this.contextMenu.set(undefined);
  }

  protected setColumnVisibility(columnId: string, visible: boolean): void {
    this.internalColumns.update((columns) =>
      columns.map((column) => (column.id === columnId ? { ...column, visible } : column)),
    );
    this.columnVisibilityChanged.emit({ columnId, visible });

    if (!this.visibleColumns().some((column) => column.id === this.sortState()?.columnId)) {
      this.sortState.set(null);
      this.sortChanged.emit(this.sortState());
    }
  }

  protected toggleColumn(columnId: string): void {
    const column = this.internalColumns().find((item) => item.id === columnId);
    if (!column || column.disableHide) {
      return;
    }

    this.setColumnVisibility(columnId, !(column.visible ?? true));
  }

  protected isColumnVisible(column: GridColumn<unknown>): boolean {
    return column.visible ?? true;
  }

  protected onHeaderDragStart(event: DragEvent, columnId: string): void {
    if (this.resizingColumnId()) {
      event.preventDefault();
      return;
    }

    this.draggingColumnId.set(columnId);
    this.dragOverColumnId.set(null);
    this.dragOverSide.set(null);
    this.previewColumnOrder.set(this.internalColumns().map((column) => column.id));
    this.dragDroppedInsideGrid = false;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', columnId);
    }
  }

  protected onHeaderDragOver(event: DragEvent, columnId: string): void {
    const draggingColumnId = this.draggingColumnId();
    if (!draggingColumnId || draggingColumnId === columnId) {
      return;
    }

    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const bounds = target.getBoundingClientRect();
    const side = event.clientX <= bounds.left + bounds.width / 2 ? 'before' : 'after';

    if (this.dragOverColumnId() === columnId && this.dragOverSide() === side) {
      return;
    }

    this.dragOverColumnId.set(columnId);
    this.dragOverSide.set(side);
    this.previewColumnOrder.set(
      this.reorderedIds(this.previewColumnOrder() ?? this.internalColumns().map((column) => column.id), draggingColumnId, columnId, side),
    );
  }

  protected onHeaderDrop(event: DragEvent, targetColumnId: string): void {
    const draggingColumnId = this.draggingColumnId();
    if (!draggingColumnId || draggingColumnId === targetColumnId) {
      this.resetDragState();
      return;
    }

    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const bounds = target.getBoundingClientRect();
    const side = event.clientX <= bounds.left + bounds.width / 2 ? 'before' : 'after';

    this.internalColumns.update((columns) =>
      this.orderColumns(
        columns,
        this.reorderedIds(
          this.previewColumnOrder() ?? columns.map((column) => column.id),
          draggingColumnId,
          targetColumnId,
          side,
        ),
      ),
    );
    this.dragDroppedInsideGrid = true;
    this.resetDragState();
  }

  protected onHeaderDragEnd(event: DragEvent, columnId: string): void {
    if (this.draggingColumnId() !== columnId) {
      return;
    }

    const gridBounds = this.gridFrame?.nativeElement.getBoundingClientRect();
    const droppedOutsideGrid = !!gridBounds
      && !this.dragDroppedInsideGrid
      && (event.clientX < gridBounds.left
        || event.clientX > gridBounds.right
        || event.clientY < gridBounds.top
        || event.clientY > gridBounds.bottom);

    if (droppedOutsideGrid) {
      const column = this.internalColumns().find((item) => item.id === columnId);
      if (column && !column.disableHide) {
        this.setColumnVisibility(columnId, false);
      }
    }

    this.resetDragState();
  }

  protected isDraggingColumn(columnId: string): boolean {
    return this.draggingColumnId() === columnId;
  }

  protected showDropIndicator(columnId: string, side: 'before' | 'after'): boolean {
    return this.dragOverColumnId() === columnId && this.dragOverSide() === side;
  }

  protected isDragTarget(columnId: string): boolean {
    return this.dragOverColumnId() === columnId;
  }

  protected onHeaderMouseDown(event: MouseEvent, columnId: string): void {
    const headerCell = event.currentTarget as HTMLElement;
    if (!this.shouldStartResize(event, headerCell, columnId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const column = this.internalColumns().find((item) => item.id === columnId);
    if (!column?.resizable) {
      return;
    }

    const startWidthPx = headerCell.getBoundingClientRect().width;
    this.resizeState = {
      columnId,
      startX: event.clientX,
      startWidthPx,
      minWidthPx: this.toPixels(column.minWidth, 72),
      maxWidthPx: this.toPixels(column.maxWidth, Number.POSITIVE_INFINITY),
    };
    this.resizingColumnId.set(columnId);
  }

  protected isResizingColumn(columnId: string): boolean {
    return this.resizingColumnId() === columnId;
  }

  protected sortIndicator(column: GridColumn<unknown>): string {
    const currentSort = this.sortState();
    if (currentSort?.columnId !== column.id) {
      return column.sortable ? '↕' : '';
    }

    return currentSort.direction === 'asc' ? '↑' : '↓';
  }

  protected headerTemplateContext(
    column: GridColumn<unknown>,
  ): GridHeaderTemplateContext<unknown> {
    return {
      column,
      sort: this.sortState(),
      sortIndicator: this.sortIndicator(column),
      toggleSort: () => this.toggleSort(column),
    };
  }

  protected renderCell(row: unknown, column: GridColumn<unknown>): string {
    if (column.cellRenderer) {
      return column.cellRenderer(row);
    }

    const value = this.getColumnValue(row, column);
    return value == null ? '' : String(value);
  }

  protected filterTemplateContext(
    column: GridColumn<unknown>,
  ): GridFilterTemplateContext<unknown> {
    return {
      column,
      value: this.filterValue(column.id),
      setValue: (value: string) => this.onFilterInput(column.id, value),
    };
  }

  protected cellTemplateContext(
    row: unknown,
    column: GridColumn<unknown>,
  ): GridCellTemplateContext<unknown> {
    return {
      row,
      column,
      value: this.getColumnValue(row, column),
      text: this.renderCell(row, column),
      startEdit: () => this.startInlineEdit(row, column),
    };
  }

  protected filterValue(columnId: string): string {
    return this.filterState()[columnId] ?? '';
  }

  protected columnWidth(column: GridColumn<unknown>): string | null {
    return column.width ?? null;
  }

  protected columnMinWidth(column: GridColumn<unknown>): string | null {
    return column.minWidth ?? null;
  }

  protected columnMaxWidth(column: GridColumn<unknown>): string | null {
    return column.maxWidth ?? null;
  }

  protected columnFlex(column: GridColumn<unknown>): string {
    return column.width ? '0 0 auto' : '1 1 0';
  }

  protected isEditable(column: GridColumn<unknown>): boolean {
    return !!column.editable && (!!column.field || !!column.valueSetter);
  }

  protected isEditingCell(row: unknown, columnId: string): boolean {
    const editing = this.editingCell();
    return editing?.row === row && editing?.columnId === columnId;
  }

  protected editorType(column: GridColumn<unknown>): string {
    return column.editorType ?? 'text';
  }

  protected startInlineEdit(row: unknown, column: GridColumn<unknown>): void {
    if (!this.isEditable(column)) {
      return;
    }

    this.editingCell.set({
      row,
      columnId: column.id,
      draftValue: String(this.getColumnValue(row, column) ?? ''),
    });
  }

  protected updateEditDraft(value: string): void {
    this.editingCell.update((editing) =>
      editing ? { ...editing, draftValue: value } : editing,
    );
  }

  protected editDraftValue(row: unknown, columnId: string): string {
    const editing = this.editingCell();
    if (!editing || editing.row !== row || editing.columnId !== columnId) {
      return '';
    }

    return editing.draftValue;
  }

  protected commitInlineEdit(row: unknown, column: GridColumn<unknown>): void {
    const editing = this.editingCell();
    if (!editing || editing.row !== row || editing.columnId !== column.id) {
      return;
    }

    const previousValue = this.getColumnValue(row, column);
    const nextValue = this.parseEditedValue(editing.draftValue, column, previousValue);
    this.editingCell.set(undefined);

    if (this.valuesEqual(previousValue, nextValue)) {
      return;
    }

    this.applyCellValue(row, column, nextValue);
    this.cellEdited.emit({
      row,
      columnId: column.id,
      previousValue,
      value: nextValue,
    });

    if (this.isServerMode()) {
      this.displayedRows.set([...this.displayedRows()]);
      return;
    }

    this.resetGrid();
  }

  protected cancelInlineEdit(): void {
    this.editingCell.set(undefined);
  }

  protected clearFilters(): void {
    const cleared = Object.keys(this.filterState()).reduce<GridFilters>((accumulator, key) => {
      accumulator[key] = '';
      return accumulator;
    }, {});

    this.filterState.set(cleared);
    this.filterChanged.emit({ ...cleared });
    this.resetGrid();
  }

  protected refresh(): void {
    this.resetGrid();
  }

  protected setMenuFilter(columnId: string, value: string): void {
    this.filterState.update((state) => ({
      ...state,
      [columnId]: value,
    }));
    this.filterChanged.emit({ ...this.filterState() });
    this.resetGrid();
  }

  protected setMenuSort(sort: GridSort | null): void {
    this.sortState.set(sort);
    this.sortChanged.emit(this.sortState());
    this.resetGrid();
  }

  @HostListener('document:click')
  protected closeMenus(): void {
    this.showMainMenu.set(false);
    this.contextMenu.set(undefined);
  }

  private syncColumns(columns: GridColumn<unknown>[]): void {
    const currentVisibility = untracked(
      () => new Map(this.internalColumns().map((column) => [column.id, column.visible ?? true])),
    );
    const currentWidths = untracked(
      () => new Map(this.internalColumns().map((column) => [column.id, column.width])),
    );

    this.internalColumns.set(
      columns.map((column) => ({
        ...column,
        sortable: column.sortable ?? false,
        filterable: column.filterable ?? true,
        resizable: column.resizable ?? true,
        width: currentWidths.get(column.id) ?? column.width,
        visible: currentVisibility.get(column.id) ?? column.visible ?? true,
      })),
    );
  }

  private resetGrid(): void {
    this.errorMessage.set('');
    this.editingCell.set(undefined);
    this.totalCount.set(undefined);
    this.nextPage = 0;
    this.displayedRows.set([]);

    if (this.isServerMode()) {
      this.hasMore.set(true);
      void this.loadServerPage(true);
      return;
    }

    this.processedClientRows = this.applyClientState(this.rows());
    const initialCount = this.infiniteScroll()
      ? Math.min(this.pageSize(), this.processedClientRows.length)
      : this.processedClientRows.length;

    this.displayedRows.set(this.processedClientRows.slice(0, initialCount));
    this.hasMore.set(this.displayedRows().length < this.processedClientRows.length);
    this.totalCount.set(this.processedClientRows.length);
    this.scheduleFillCheck();
  }

  private loadMore(): void {
    if (this.loading() || !this.hasMore() || !this.infiniteScroll()) {
      return;
    }

    if (this.isServerMode()) {
      void this.loadServerPage(false);
      return;
    }

    const nextCount = Math.min(
      this.displayedRows().length + this.pageSize(),
      this.processedClientRows.length,
    );

    this.displayedRows.set(this.processedClientRows.slice(0, nextCount));
    this.hasMore.set(this.displayedRows().length < this.processedClientRows.length);
    this.scheduleFillCheck();
  }

  private async loadServerPage(reset: boolean): Promise<void> {
    const serverDataSource = this.dataSource();
    if (!serverDataSource || this.loading() || (!this.hasMore() && !reset)) {
      return;
    }

    this.loading.set(true);
    const request: GridPageRequest = {
      page: this.nextPage,
      pageSize: this.pageSize(),
      sort: this.sortState(),
      filters: { ...this.filterState() },
    };

    try {
      const result = await Promise.resolve(serverDataSource(request));
      this.consumeServerResult(result, reset);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load rows.',
      );
      this.hasMore.set(false);
    } finally {
      this.loading.set(false);
      this.scheduleFillCheck();
    }
  }

  private consumeServerResult(result: GridPageResult<unknown>, reset: boolean): void {
    const incomingRows = result.rows ?? [];
    this.displayedRows.set(
      reset ? incomingRows : [...this.displayedRows(), ...incomingRows],
    );
    this.totalCount.set(result.total);

    const totalAvailable = result.total ?? this.displayedRows().length;
    const inferredHasMore = result.hasMore
      ?? (result.total != null
        ? this.displayedRows().length < result.total
        : incomingRows.length === this.pageSize());

    this.hasMore.set(inferredHasMore);
    this.nextPage = incomingRows.length > 0 || reset ? this.nextPage + 1 : this.nextPage;

    if (!incomingRows.length && totalAvailable === this.displayedRows().length) {
      this.hasMore.set(false);
    }
  }

  private applyClientState(rows: unknown[]): unknown[] {
    const filteredRows = rows.filter((row) => this.matchesFilters(row));
    const currentSort = this.sortState();
    if (!currentSort) {
      return filteredRows;
    }

    const sortColumn = this.internalColumns().find((column) => column.id === currentSort.columnId);
    if (!sortColumn) {
      return filteredRows;
    }

    return [...filteredRows].sort((left, right) =>
      this.compareRows(left, right, sortColumn, currentSort.direction),
    );
  }

  private matchesFilters(row: unknown): boolean {
    return Object.entries(this.filterState()).every(([columnId, filterValue]) => {
      const normalizedFilter = filterValue.trim().toLowerCase();
      if (!normalizedFilter) {
        return true;
      }

      const column = this.internalColumns().find((item) => item.id === columnId);
      if (!column) {
        return true;
      }

      const value = this.getColumnValue(row, column);
      return String(value ?? '').toLowerCase().includes(normalizedFilter);
    });
  }

  private compareRows(
    left: unknown,
    right: unknown,
    column: GridColumn<unknown>,
    direction: GridSort['direction'],
  ): number {
    const multiplier = direction === 'asc' ? 1 : -1;
    const leftValue = this.getColumnValue(left, column);
    const rightValue = this.getColumnValue(right, column);

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * multiplier;
    }

    return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * multiplier;
  }

  private getColumnValue(row: unknown, column: GridColumn<unknown>): unknown {
    const record = row as Record<string, unknown>;
    if (column.valueGetter) {
      return column.valueGetter(row);
    }

    if (column.field) {
      return record[column.field];
    }

    return record[column.id];
  }

  private buildMenuItems(
    items: GridMenuItems<unknown>,
    row?: unknown,
  ): GridMenuItem<unknown>[] {
    const context = this.buildMenuContext(row);
    const resolved = typeof items === 'function' ? items(context) : items;

    return resolved
      .filter((item) => {
        const hidden = typeof item.hidden === 'function' ? item.hidden(context) : item.hidden;
        return !hidden;
      })
      .map((item) => ({
        ...item,
        disabled: typeof item.disabled === 'function' ? item.disabled(context) : item.disabled,
      }));
  }

  private buildMenuContext(row?: unknown): GridMenuContext<unknown> {
    return {
      row,
      rows: this.displayedRows(),
      visibleColumns: this.visibleColumns(),
      sort: this.sortState(),
      filters: { ...this.filterState() },
      refresh: () => this.refresh(),
      clearFilters: () => this.clearFilters(),
      setFilter: (columnId: string, value: string) => this.setMenuFilter(columnId, value),
      setSort: (sort: GridSort | null) => this.setMenuSort(sort),
      toggleColumn: (columnId: string) => this.toggleColumn(columnId),
    };
  }

  private isServerMode(): boolean {
    return typeof this.dataSource() === 'function';
  }

  private resetDragState(): void {
    this.draggingColumnId.set(null);
    this.dragOverColumnId.set(null);
    this.dragOverSide.set(null);
    this.previewColumnOrder.set(null);
    this.dragDroppedInsideGrid = false;
  }

  private reorderedIds(
    columnIds: string[],
    draggingColumnId: string,
    targetColumnId: string,
    side: 'before' | 'after',
  ): string[] {
    const sourceIndex = columnIds.findIndex((columnId) => columnId === draggingColumnId);
    const targetIndex = columnIds.findIndex((columnId) => columnId === targetColumnId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return columnIds;
    }

    const reorderedIds = [...columnIds];
    const [movedColumnId] = reorderedIds.splice(sourceIndex, 1);
    let insertionIndex = reorderedIds.findIndex((columnId) => columnId === targetColumnId);

    if (insertionIndex === -1) {
      return columnIds;
    }

    if (side === 'after') {
      insertionIndex += 1;
    }

    reorderedIds.splice(insertionIndex, 0, movedColumnId);
    return reorderedIds;
  }

  private orderColumns(
    columns: GridColumn<unknown>[],
    orderedIds: string[] | null,
  ): GridColumn<unknown>[] {
    if (!orderedIds?.length) {
      return columns;
    }

    const columnMap = new Map(columns.map((column) => [column.id, column]));
    const orderedColumns = orderedIds
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is GridColumn<unknown> => !!column);

    return orderedColumns.length === columns.length ? orderedColumns : columns;
  }

  private clampWidth(widthPx: number, minWidthPx: number, maxWidthPx: number): number {
    return Math.min(Math.max(widthPx, minWidthPx), maxWidthPx);
  }

  private shouldStartResize(
    event: MouseEvent,
    headerCell: HTMLElement,
    columnId: string,
  ): boolean {
    const column = this.internalColumns().find((item) => item.id === columnId);
    if (!column?.resizable) {
      return false;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button, input, select, textarea, option, [contenteditable="true"], .drag-handle',
      )
    ) {
      return false;
    }

    const bounds = headerCell.getBoundingClientRect();
    return bounds.right - event.clientX <= 10;
  }

  private toPixels(size: string | undefined, fallback: number): number {
    if (!size) {
      return fallback;
    }

    const parsed = Number.parseFloat(size);
    if (Number.isNaN(parsed)) {
      return fallback;
    }

    if (/^\d+(\.\d+)?(px)?$/.test(size.trim())) {
      return parsed;
    }

    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.width = size;
    document.body.appendChild(probe);
    const widthPx = probe.getBoundingClientRect().width;
    probe.remove();
    return widthPx || fallback;
  }

  private applyCellValue(row: unknown, column: GridColumn<unknown>, value: unknown): void {
    const record = row as Record<string, unknown>;

    if (column.valueSetter) {
      column.valueSetter(row, value);
    } else if (column.field) {
      record[column.field] = value;
    }
  }

  private parseEditedValue(
    rawValue: string,
    column: GridColumn<unknown>,
    previousValue: unknown,
  ): unknown {
    if (column.editorType === 'number' || typeof previousValue === 'number') {
      const parsed = Number(rawValue);
      return Number.isNaN(parsed) ? previousValue : parsed;
    }

    return rawValue;
  }

  private valuesEqual(left: unknown, right: unknown): boolean {
    return Object.is(left, right);
  }

  private scheduleFillCheck(): void {
    if (!this.viewReady) {
      return;
    }

    if (this.afterRenderTimer) {
      window.clearTimeout(this.afterRenderTimer);
    }

    this.afterRenderTimer = window.setTimeout(() => {
      const body = this.bodyScroller?.nativeElement;
      if (!body || this.loading() || !this.hasMore() || !this.infiniteScroll()) {
        return;
      }

      if (body.scrollHeight <= body.clientHeight + 16) {
        this.loadMore();
      }
    }, 0);
  }
}
