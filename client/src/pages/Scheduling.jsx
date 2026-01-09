import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

function Scheduling() {
    const [appointments, setAppointments] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        customer_id: '',
        address_id: '',
        scheduled_date: '',
        scheduled_time: '',
        notes: ''
    });
    const [customerAddresses, setCustomerAddresses] = useState([]);

    useEffect(() => {
        fetchData();
    }, [selectedDate]);

    const fetchData = async () => {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        try {
            const [appointmentsRes, customersRes] = await Promise.all([
                fetch(`${API_URL}/api/appointments?date=${selectedDate}`, { headers }),
                fetch(`${API_URL}/api/customers`, { headers })
            ]);

            const [appointmentsData, customersData] = await Promise.all([
                appointmentsRes.json(),
                customersRes.json()
            ]);

            setAppointments(appointmentsData);
            setCustomers(customersData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomerAddresses = async (customerId) => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${API_URL}/api/customers/${customerId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setCustomerAddresses(data.addresses || []);
        } catch (error) {
            console.error('Error fetching addresses:', error);
        }
    };

    const handleCustomerChange = (customerId) => {
        setFormData({ ...formData, customer_id: customerId, address_id: '' });
        if (customerId) {
            fetchCustomerAddresses(customerId);
        } else {
            setCustomerAddresses([]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');

        try {
            const response = await fetch(`${API_URL}/api/appointments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                fetchData();
                closeModal();
            }
        } catch (error) {
            console.error('Error creating appointment:', error);
        }
    };

    const handleStatusChange = async (appointmentId, status) => {
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_URL}/api/appointments/${appointmentId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            fetchData();
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    const openModal = () => {
        setFormData({
            customer_id: '',
            address_id: '',
            scheduled_date: selectedDate,
            scheduled_time: '',
            notes: ''
        });
        setCustomerAddresses([]);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'scheduled': return 'bg-blue-100 text-blue-800';
            case 'in_progress': return 'bg-yellow-100 text-yellow-800';
            case 'completed': return 'bg-green-100 text-green-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Generate week dates
    const getWeekDates = () => {
        const current = new Date(selectedDate);
        const week = [];
        const dayOfWeek = current.getDay();
        const startOfWeek = new Date(current);
        startOfWeek.setDate(current.getDate() - dayOfWeek);

        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            week.push(date);
        }
        return week;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center">
                    <svg className="h-8 w-8 text-primary-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <h1 className="text-2xl font-bold text-gray-900">Scheduling</h1>
                </div>
                <button
                    onClick={openModal}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center"
                >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    New Appointment
                </button>
            </div>

            {/* Week Navigation */}
            <div className="bg-white rounded-lg shadow mb-6">
                <div className="flex items-center justify-between p-4 border-b">
                    <button
                        onClick={() => {
                            const prev = new Date(selectedDate);
                            prev.setDate(prev.getDate() - 7);
                            setSelectedDate(prev.toISOString().split('T')[0]);
                        }}
                        className="p-2 hover:bg-gray-100 rounded"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                    />
                    <button
                        onClick={() => {
                            const next = new Date(selectedDate);
                            next.setDate(next.getDate() + 7);
                            setSelectedDate(next.toISOString().split('T')[0]);
                        }}
                        className="p-2 hover:bg-gray-100 rounded"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* Week Days */}
                <div className="grid grid-cols-7 divide-x">
                    {getWeekDates().map((date) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const isSelected = dateStr === selectedDate;
                        const isToday = dateStr === new Date().toISOString().split('T')[0];

                        return (
                            <button
                                key={dateStr}
                                onClick={() => setSelectedDate(dateStr)}
                                className={`p-3 text-center hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''}`}
                            >
                                <div className="text-xs text-gray-500">
                                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                </div>
                                <div className={`text-lg font-semibold ${isToday ? 'text-primary-600' : ''}`}>
                                    {date.getDate()}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Appointments List */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b">
                    <h2 className="font-semibold">
                        Appointments for {new Date(selectedDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}
                    </h2>
                </div>
                <div className="divide-y">
                    {appointments.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No appointments scheduled for this day.
                        </div>
                    ) : (
                        appointments.map((appt) => (
                            <div key={appt.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center space-x-4">
                                    <div className="text-lg font-medium text-gray-900 w-20">
                                        {appt.scheduled_time || 'Any time'}
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-900">{appt.customer_name}</div>
                                        <div className="text-sm text-gray-500">
                                            {appt.street}, {appt.city}
                                        </div>
                                        {appt.service_name && (
                                            <div className="text-sm text-primary-600">{appt.service_name}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(appt.status)}`}>
                                        {appt.status}
                                    </span>
                                    <select
                                        value={appt.status}
                                        onChange={(e) => handleStatusChange(appt.id, e.target.value)}
                                        className="text-sm border rounded px-2 py-1"
                                    >
                                        <option value="scheduled">Scheduled</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold">New Appointment</h3>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                                <select
                                    value={formData.customer_id}
                                    onChange={(e) => handleCustomerChange(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    required
                                >
                                    <option value="">Select customer</option>
                                    {customers.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                                <select
                                    value={formData.address_id}
                                    onChange={(e) => setFormData({ ...formData, address_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    required
                                    disabled={!formData.customer_id}
                                >
                                    <option value="">Select address</option>
                                    {customerAddresses.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.street}, {a.city}, {a.state} {a.zip}
                                        </option>
                                    ))}
                                </select>
                                {formData.customer_id && customerAddresses.length === 0 && (
                                    <p className="text-sm text-yellow-600 mt-1">
                                        This customer has no addresses. Add one first.
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                                    <input
                                        type="date"
                                        value={formData.scheduled_date}
                                        onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                                    <input
                                        type="time"
                                        value={formData.scheduled_time}
                                        onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    rows="2"
                                />
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Scheduling;
