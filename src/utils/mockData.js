export const mockEvents = [
  {
    id: 'evt_1',
    name: 'Rahul & Priya Wedding',
    date: '2025-11-15',
    location: 'Taj Lands End, Mumbai',
    coverImage: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=2069&auto=format&fit=crop',
    photoCount: 1284,
    faceCount: 236,
    guestCount: 150,
    status: 'Indexed'
  },
  {
    id: 'evt_2',
    name: 'Tech Innovators Gala',
    date: '2025-12-05',
    location: 'JW Marriott, Bangalore',
    coverImage: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=2070&auto=format&fit=crop',
    photoCount: 845,
    faceCount: 120,
    guestCount: 85,
    status: 'Processing'
  }
];

export const mockPhotos = Array.from({ length: 37 }).map((_, i) => ({
  id: `p_${i}`,
  eventId: 'evt_1',
  url: `https://source.unsplash.com/random/800x${600 + (i % 3) * 200}?wedding,portrait,event&sig=${i}`,
  width: 800,
  height: 600 + (i % 3) * 200,
  matchConfidence: 0.9 + (Math.random() * 0.09)
}));

export const mockUser = {
  id: 'usr_1',
  name: 'Arjun',
  phone: '+919876543210',
  role: 'photographer' // 'guest' or 'photographer'
};
