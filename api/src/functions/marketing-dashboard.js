const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('marketing-dashboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'marketing/dashboard',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const [clients, campaigns] = await Promise.all([
        queryItems('clients', 'SELECT * FROM c'),
        queryItems('campaigns', 'SELECT * FROM c')
      ]);

      const statusCounts = { lead: 0, contacted: 0, quoted: 0, negotiating: 0, won: 0, lost: 0 };
      const sourceCounts = {};
      let pipelineValue = 0;
      let revenueWon = 0;
      const monthlyLeads = {};

      clients.forEach(c => {
        statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
        sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1;
        if (c.status !== 'lost' && c.status !== 'won') pipelineValue += c.estimatedValue || 0;
        if (c.status === 'won') revenueWon += c.estimatedValue || 0;

        const month = (c.createdAt || '').substring(0, 7);
        if (month) monthlyLeads[month] = (monthlyLeads[month] || 0) + 1;
      });

      const totalLeads = clients.length;
      const conversionRate = totalLeads > 0 ? Math.round((statusCounts.won / totalLeads) * 100) : 0;

      const activeCampaigns = campaigns.filter(c => c.status === 'active');
      const totalCampaignMetrics = { sent: 0, opened: 0, replied: 0, leadsGenerated: 0, conversions: 0, revenue: 0 };
      campaigns.forEach(c => {
        if (c.metrics) {
          Object.keys(totalCampaignMetrics).forEach(k => { totalCampaignMetrics[k] += c.metrics[k] || 0; });
        }
      });

      const followUpsDue = clients.filter(c =>
        c.followUpDate && new Date(c.followUpDate) <= new Date() && c.status !== 'won' && c.status !== 'lost'
      ).length;

      return jsonResponse({
        summary: {
          totalLeads,
          conversionRate,
          pipelineValue,
          revenueWon,
          followUpsDue,
          activeCampaignCount: activeCampaigns.length
        },
        statusCounts,
        sourceCounts,
        monthlyLeads,
        campaignMetrics: totalCampaignMetrics,
        activeCampaigns: activeCampaigns.map(c => ({
          id: c.id, name: c.name, type: c.type, status: c.status,
          metrics: c.metrics, channels: c.channels,
          startDate: c.startDate, endDate: c.endDate
        }))
      });
    } catch (err) {
      return jsonResponse({ error: 'Failed to load marketing dashboard' }, 500);
    }
  }
});
