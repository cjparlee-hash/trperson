export const tourSteps = [
    // Welcome & Dashboard
    {
        target: 'body',
        content: 'Welcome to TrashPerson CRM! Let\'s take a quick tour of the features.',
        placement: 'center',
        disableBeacon: true,
    },
    {
        target: '#stats-cards',
        content: 'View key metrics at a glance - total customers, active leads, today\'s pickups, and pending invoices.',
        placement: 'bottom',
    },
    {
        target: '#quick-actions',
        content: 'Jump to common tasks with one click - add customers, schedule appointments, create invoices, or plan routes.',
        placement: 'top',
    },
    {
        target: '#sidebar-nav',
        content: 'Navigate between modules using the sidebar. Each section has its own set of features.',
        placement: 'right',
    },
    {
        target: '#dark-mode-toggle',
        content: 'Toggle dark mode for comfortable viewing in any lighting.',
        placement: 'right',
    },
    {
        target: '#help-button',
        content: 'Click here anytime to restart this tour and review the features.',
        placement: 'right',
    },
    // Customers
    {
        target: '#add-customer-btn',
        content: 'Click here to add new customers with their contact info and service addresses.',
        placement: 'bottom',
        page: '/customers',
    },
    {
        target: '#customers-table',
        content: 'View and manage all your customers here. Click Edit to update details or add service addresses.',
        placement: 'top',
    },
    // Leads
    {
        target: '#leads-view-toggle',
        content: 'Switch between pipeline view (kanban board) and list view.',
        placement: 'bottom',
        page: '/leads',
    },
    {
        target: '#leads-pipeline',
        content: 'Track leads through stages: New, Contacted, Quoted, then Won or Lost. Change stages using the dropdown.',
        placement: 'bottom',
    },
    {
        target: '#add-lead-btn',
        content: 'Add potential customers to your sales pipeline and track their journey.',
        placement: 'bottom',
    },
    // Scheduling
    {
        target: '#schedule-view-toggle',
        content: 'Switch between week and month calendar views to see your schedule.',
        placement: 'bottom',
        page: '/scheduling',
    },
    {
        target: '#appointments-list',
        content: 'See scheduled pickups for the selected day. Update status as you complete each job.',
        placement: 'top',
    },
    {
        target: '#new-appointment-btn',
        content: 'Schedule a new pickup appointment for any customer.',
        placement: 'bottom',
    },
    // Billing
    {
        target: '#billing-stats',
        content: 'Track your revenue at a glance - total invoiced, paid, pending, and overdue amounts.',
        placement: 'bottom',
        page: '/billing',
    },
    {
        target: '#billing-tabs',
        content: 'Filter invoices by status to quickly find what you need.',
        placement: 'bottom',
    },
    {
        target: '#create-invoice-btn',
        content: 'Generate invoices with line items and tax. Mark them as sent, paid, or overdue.',
        placement: 'bottom',
    },
    // Routes
    {
        target: '#routes-list',
        content: 'View and select routes for any date. See completion progress at a glance.',
        placement: 'right',
        page: '/routes',
    },
    {
        target: '#route-map',
        content: 'See your route visualized on the map with numbered stops. Click "Open in Google Maps" for turn-by-turn navigation.',
        placement: 'left',
    },
    {
        target: '#create-route-btn',
        content: 'Build optimized routes from your scheduled appointments. The system will calculate the most efficient order.',
        placement: 'bottom',
    },
    // Final
    {
        target: 'body',
        content: 'You\'re all set! Start by adding your customers, then schedule pickups and plan your routes. Click the ? button anytime to see this tour again.',
        placement: 'center',
    },
];
