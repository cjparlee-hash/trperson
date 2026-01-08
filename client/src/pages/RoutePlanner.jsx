import { useState, useEffect, useRef } from 'react';

function RoutePlanner() {
    const [routes, setRoutes] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        date: '',
        appointment_ids: []
    });
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    useEffect(() => {
        fetchData();
    }, [selectedDate]);

    useEffect(() => {
        if (selectedRoute && selectedRoute.stops && window.google) {
            initMap();
        }
    }, [selectedRoute]);

    const fetchData = async () => {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        try {
            const [routesRes, appointmentsRes] = await Promise.all([
                fetch(`/api/routes?date=${selectedDate}`, { headers }),
                fetch(`/api/appointments?date=${selectedDate}&status=scheduled`, { headers })
            ]);

            const [routesData, appointmentsData] = await Promise.all([
                routesRes.json(),
                appointmentsRes.json()
            ]);

            setRoutes(routesData);
            setAppointments(appointmentsData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRouteDetails = async (routeId) => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`/api/routes/${routeId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setSelectedRoute(data);
        } catch (error) {
            console.error('Error fetching route:', error);
        }
    };

    const initMap = () => {
        if (!mapRef.current || !selectedRoute?.stops?.length) return;

        const stopsWithCoords = selectedRoute.stops.filter(s => s.lat && s.lng);
        if (stopsWithCoords.length === 0) return;

        const center = {
            lat: stopsWithCoords[0].lat,
            lng: stopsWithCoords[0].lng
        };

        const map = new window.google.maps.Map(mapRef.current, {
            zoom: 12,
            center
        });

        mapInstanceRef.current = map;

        // Add markers for each stop
        stopsWithCoords.forEach((stop, index) => {
            new window.google.maps.Marker({
                position: { lat: stop.lat, lng: stop.lng },
                map,
                label: String(index + 1),
                title: `${stop.customer_name}: ${stop.street}`
            });
        });

        // Draw route if more than one stop
        if (stopsWithCoords.length > 1) {
            const directionsService = new window.google.maps.DirectionsService();
            const directionsRenderer = new window.google.maps.DirectionsRenderer({
                map,
                suppressMarkers: true
            });

            const waypoints = stopsWithCoords.slice(1, -1).map(stop => ({
                location: { lat: stop.lat, lng: stop.lng },
                stopover: true
            }));

            directionsService.route({
                origin: { lat: stopsWithCoords[0].lat, lng: stopsWithCoords[0].lng },
                destination: {
                    lat: stopsWithCoords[stopsWithCoords.length - 1].lat,
                    lng: stopsWithCoords[stopsWithCoords.length - 1].lng
                },
                waypoints,
                optimizeWaypoints: false,
                travelMode: window.google.maps.TravelMode.DRIVING
            }, (result, status) => {
                if (status === 'OK') {
                    directionsRenderer.setDirections(result);
                }
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');

        try {
            const response = await fetch('/api/routes', {
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
            console.error('Error creating route:', error);
        }
    };

    const handleStopStatus = async (routeId, stopId, status) => {
        const token = localStorage.getItem('token');
        try {
            await fetch(`/api/routes/${routeId}/stops/${stopId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            fetchRouteDetails(routeId);
        } catch (error) {
            console.error('Error updating stop:', error);
        }
    };

    const openModal = () => {
        setFormData({
            name: `Route ${selectedDate}`,
            date: selectedDate,
            appointment_ids: []
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
    };

    const toggleAppointment = (apptId) => {
        const ids = formData.appointment_ids.includes(apptId)
            ? formData.appointment_ids.filter(id => id !== apptId)
            : [...formData.appointment_ids, apptId];
        setFormData({ ...formData, appointment_ids: ids });
    };

    const openInGoogleMaps = () => {
        if (!selectedRoute?.stops?.length) return;

        const stopsWithCoords = selectedRoute.stops.filter(s => s.lat && s.lng);
        if (stopsWithCoords.length === 0) return;

        const origin = `${stopsWithCoords[0].lat},${stopsWithCoords[0].lng}`;
        const destination = stopsWithCoords.length > 1
            ? `${stopsWithCoords[stopsWithCoords.length - 1].lat},${stopsWithCoords[stopsWithCoords.length - 1].lng}`
            : origin;

        const waypoints = stopsWithCoords.slice(1, -1)
            .map(s => `${s.lat},${s.lng}`)
            .join('|');

        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
        if (waypoints) {
            url += `&waypoints=${waypoints}`;
        }

        window.open(url, '_blank');
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
                <h1 className="text-2xl font-bold text-gray-900">Route Planner</h1>
                <div className="flex items-center space-x-4">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                    />
                    <button
                        onClick={openModal}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Create Route
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Routes List */}
                <div className="col-span-1 bg-white rounded-lg shadow">
                    <div className="px-4 py-3 border-b font-semibold">Routes for {selectedDate}</div>
                    <div className="divide-y">
                        {routes.length === 0 ? (
                            <div className="p-4 text-center text-gray-500">
                                No routes planned for this day.
                            </div>
                        ) : (
                            routes.map((route) => (
                                <button
                                    key={route.id}
                                    onClick={() => fetchRouteDetails(route.id)}
                                    className={`w-full p-4 text-left hover:bg-gray-50 ${
                                        selectedRoute?.id === route.id ? 'bg-primary-50' : ''
                                    }`}
                                >
                                    <div className="font-medium">{route.name}</div>
                                    <div className="text-sm text-gray-500">
                                        {route.completed_count || 0} / {route.stop_count || 0} stops completed
                                    </div>
                                    <div className="mt-1">
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                                            route.status === 'completed' ? 'bg-green-100 text-green-800' :
                                            route.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {route.status}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Map and Details */}
                <div className="col-span-2 space-y-4">
                    {selectedRoute ? (
                        <>
                            {/* Map */}
                            <div className="bg-white rounded-lg shadow">
                                <div className="px-4 py-3 border-b flex justify-between items-center">
                                    <span className="font-semibold">{selectedRoute.name}</span>
                                    <button
                                        onClick={openInGoogleMaps}
                                        className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
                                    >
                                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        Open in Google Maps
                                    </button>
                                </div>
                                <div ref={mapRef} className="h-64 bg-gray-100">
                                    {!window.google && (
                                        <div className="h-full flex items-center justify-center text-gray-500">
                                            <div className="text-center">
                                                <p>Google Maps not loaded.</p>
                                                <p className="text-sm">Add your API key to enable maps.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Stops List */}
                            <div className="bg-white rounded-lg shadow">
                                <div className="px-4 py-3 border-b font-semibold">Stops</div>
                                <div className="divide-y">
                                    {selectedRoute.stops?.map((stop, index) => (
                                        <div key={stop.id} className="p-4 flex items-center justify-between">
                                            <div className="flex items-center space-x-4">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium ${
                                                    stop.status === 'completed' ? 'bg-green-500' :
                                                    stop.status === 'skipped' ? 'bg-gray-400' :
                                                    'bg-primary-600'
                                                }`}>
                                                    {stop.status === 'completed' ? '✓' : index + 1}
                                                </div>
                                                <div>
                                                    <div className="font-medium">{stop.customer_name}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {stop.street}, {stop.city}
                                                    </div>
                                                    {stop.scheduled_time && (
                                                        <div className="text-sm text-primary-600">{stop.scheduled_time}</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                {stop.customer_phone && (
                                                    <a href={`tel:${stop.customer_phone}`} className="p-2 text-gray-400 hover:text-gray-600">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                        </svg>
                                                    </a>
                                                )}
                                                <select
                                                    value={stop.status}
                                                    onChange={(e) => handleStopStatus(selectedRoute.id, stop.id, e.target.value)}
                                                    className="text-sm border rounded px-2 py-1"
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="skipped">Skipped</option>
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                            Select a route to view details and map.
                        </div>
                    )}
                </div>
            </div>

            {/* Create Route Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold">Create Route</h3>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Route Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Select Appointments ({formData.appointment_ids.length} selected)
                                </label>
                                <div className="border rounded-lg max-h-48 overflow-y-auto">
                                    {appointments.length === 0 ? (
                                        <div className="p-4 text-center text-gray-500 text-sm">
                                            No scheduled appointments for this date.
                                        </div>
                                    ) : (
                                        appointments.map((appt) => (
                                            <label
                                                key={appt.id}
                                                className="flex items-center p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={formData.appointment_ids.includes(appt.id)}
                                                    onChange={() => toggleAppointment(appt.id)}
                                                    className="mr-3"
                                                />
                                                <div>
                                                    <div className="font-medium">{appt.customer_name}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {appt.street}, {appt.city}
                                                    </div>
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={formData.appointment_ids.length === 0}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Create Route
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RoutePlanner;
