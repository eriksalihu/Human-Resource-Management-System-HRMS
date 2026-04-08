/**
 * @file frontend/src/components/common/DataTable.jsx
 * @description Reusable data table with sortable columns, loading/empty states
 * @author Dev B
 */

import LoadingSpinner from './LoadingSpinner';

/**
 * DataTable - Flexible, sortable data table component
 * Renders tabular data with sortable column headers, loading skeleton,
 * empty state message, and row click handler.
 *
 * @param {Object} props
 * @param {Array<{ key: string, label: string, sortable?: boolean, render?: Function }>} props.columns - Column definitions
 * @param {Array<Object>} props.data - Array of row data objects
 * @param {boolean} [props.loading=false] - Whether to show loading state
 * @param {string} [props.sortBy] - Currently sorted column key
 * @param {string} [props.sortOrder='ASC'] - Current sort direction
 * @param {Function} [props.onSort] - Callback when a sortable column header is clicked
 * @param {Function} [props.onRowClick] - Callback when a row is clicked
 * @param {string} [props.emptyMessage='No records found'] - Message when data is empty
 * @returns {JSX.Element} The data table
 */
const DataTable = ({
  columns,
  data,
  loading = false,
  sortBy,
  sortOrder = 'ASC',
  onSort,
  onRowClick,
  emptyMessage = 'No records found',
}) => {
  /**
   * Handle column header click for sorting.
   * @param {string} columnKey - The column key to sort by
   */
  const handleSort = (columnKey) => {
    if (!onSort) return;
    const newOrder = sortBy === columnKey && sortOrder === 'ASC' ? 'DESC' : 'ASC';
    onSort(columnKey, newOrder);
  };

  /**
   * Render sort indicator arrow for the active sort column.
   * @param {string} columnKey - The column key
   * @returns {JSX.Element|null} Sort indicator or null
   */
  const renderSortIcon = (columnKey) => {
    if (sortBy !== columnKey) {
      return (
        <svg className="w-4 h-4 text-gray-300 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-indigo-600 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={sortOrder === 'ASC' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
        />
      </svg>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12">
        <LoadingSpinner size="lg" message="Loading data..." />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          {/* Table header */}
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer select-none hover:bg-gray-100 transition-colors' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center">
                    {column.label}
                    {column.sortable && renderSortIcon(column.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Table body */}
          <tbody className="bg-white divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-sm text-gray-500">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={row.id || index}
                  className={`${
                    onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                  } transition-colors`}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map((column) => (
                    <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
