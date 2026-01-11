import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const stages = [
    { id: 'new', label: 'New', color: 'bg-gray-100' },
    { id: 'contacted', label: 'Contacted', color: 'bg-blue-100' },
    { id: 'quoted', label: 'Quoted', color: 'bg-yellow-100' },
    { id: 'negotiating', label: 'Negotiating', color: 'bg-purple-100' },
    { id: 'won', label: 'Won', color: 'bg-green-100' },
    { id: 'lost', label: 'Lost', color: 'bg-red-100' },
];

function Leads() {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedLead, setSelectedLead] = useState(null);
    const [viewMode, setViewMode] = useState('pipeline');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        source: '',
        stage: 'new',
        notes: '',
        follow_up_date: ''
    });

    useEffect(() => {
        fetchLeads();
    }, []);

    const fetchLeads = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${API_URL}/api/leads`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setLeads(data);
        } catch (error) {
            console.error('Error fetching leads:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');

        try {
            const url = selectedLead ? `/api/leads/${selectedLead.id}` : '/api/leads';
            const method = selectedLead ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                fetchLeads();
                closeModal();
            }
        } catch (error) {
            console.error('Error saving lead:', error);
        }
    };

    const handleStageChange = async (leadId, newStage) => {
        const token = localStorage.getItem('token');
        const lead = leads.find(l => l.id === leadId);

        try {
            await fetch(`${API_URL}/api/leads/${leadId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ ...lead, stage: newStage })
            });
            fetchLeads();
        } catch (error) {
            console.error('Error updating lead stage:', error);
        }
    };

    const handleConvert = async (leadId) => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${API_URL}/api/leads/${leadId}/convert`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                fetchLeads();
                alert('Lead converted to customer!');
            }
        } catch (error) {
            console.error('Error converting lead:', error);
        }
    };

    const openModal = (lead = null) => {
        if (lead) {
            setSelectedLead(lead);
            setFormData({
                name: lead.name,
                email: lead.email || '',
                phone: lead.phone || '',
                address: lead.address || '',
                source: lead.source || '',
                stage: lead.stage,
                notes: lead.notes || '',
                follow_up_date: lead.follow_up_date || ''
            });
        } else {
            setSelectedLead(null);
            setFormData({
                name: '', email: '', phone: '', address: '',
                source: '', stage: 'new', notes: '', follow_up_date: ''
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedLead(null);
    };

    const getLeadsByStage = (stage) => leads.filter(l => l.stage === stage);

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
                    <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('pipeline')}
                            className={`px-3 py-1 rounded-md text-sm font-medium ${
                                viewMode === 'pipeline' ? 'bg-white shadow' : ''
                            }`}
                        >
                            Pipeline
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-1 rounded-md text-sm font-medium ${
                                viewMode === 'list' ? 'bg-white shadow' : ''
                            }`}
                        >
                            List
                        </button>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Lead
                    </button>
                </div>
            </div>

            {viewMode === 'pipeline' ? (
                <div className="flex space-x-4 overflow-x-auto pb-4">
                    {stages.filter(s => s.id !== 'won' && s.id !== 'lost').map((stage) => (
                        <div key={stage.id} className={`flex-shrink-0 w-72 ${stage.color} rounded-lg p-4`}>
                            <h3 className="font-semibold text-gray-700 mb-3">
                                {stage.label} ({getLeadsByStage(stage.id).length})
                            </h3>
                            <div className="space-y-3">
                                {getLeadsByStage(stage.id).map((lead) => (
                                    <div key={lead.id} className="bg-white rounded-lg shadow p-4">
                                        <div className="font-medium text-gray-900">{lead.name}</div>
                                        {lead.phone && <div className="text-sm text-gray-500">{lead.phone}</div>}
                                        {lead.source && (
                                            <div className="text-xs text-gray-400 mt-1">Source: {lead.source}</div>
                                        )}
                                        <div className="mt-3 flex space-x-2">
                                            <button
                                                onClick={() => openModal(lead)}
                                                className="text-xs text-primary-600 hover:text-primary-800"
                                            >
                                                Edit
                                            </button>
                                            {stage.id === 'negotiating' && (
                                                <button
                                                    onClick={() => handleConvert(lead.id)}
                                                    className="text-xs text-green-600 hover:text-green-800"
                                                >
                                                    Convert
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {leads.map((lead) => (
                                <tr key={lead.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium">{lead.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm">{lead.email}</div>
                                        <div className="text-sm text-gray-500">{lead.phone}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <select
                                            value={lead.stage}
                                            onChange={(e) => handleStageChange(lead.id, e.target.value)}
                                            className="text-sm border rounded px-2 py-1"
                                        >
                                            {stages.map((s) => (
                                                <option key={s.id} value={s.id}>{s.label}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{lead.source}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <button onClick={() => openModal(lead)} className="text-primary-600 hover:text-primary-900 mr-3">
                                            Edit
                                        </button>
                                        <button onClick={() => handleConvert(lead.id)} className="text-green-600 hover:text-green-900">
                                            Convert
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto py-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 my-auto">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold">{selectedLead ? 'Edit Lead' : 'Add Lead'}</h3>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                                    <input
                                        type="text"
                                        value={formData.source}
                                        onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                                        placeholder="e.g., Website, Referral"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                                    <select
                                        value={formData.stage}
                                        onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    >
                                        {stages.map((s) => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Date</label>
                                <input
                                    type="date"
                                    value={formData.follow_up_date}
                                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    rows="3"
                                />
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                    {selectedLead ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Leads;
