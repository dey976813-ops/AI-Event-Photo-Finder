import { mockEvents, mockPhotos, mockUser } from '../utils/mockData';

// Simulate API delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  auth: {
    loginWithPhone: async (phone) => {
      await delay(1000);
      return { success: true, message: 'OTP sent' };
    },
    verifyOTP: async (phone, otp) => {
      await delay(1500);
      if (otp === '123456') { // Mock valid OTP
        return { success: true, user: mockUser };
      }
      throw new Error('Invalid OTP');
    }
  },
  events: {
    getEvents: async () => {
      await delay(800);
      return mockEvents;
    },
    getEventById: async (id) => {
      await delay(600);
      return mockEvents.find(e => e.id === id);
    },
    createEvent: async (eventData) => {
      await delay(1200);
      const newEvent = {
        id: `evt_${Date.now()}`,
        ...eventData,
        photoCount: 0,
        faceCount: 0,
        guestCount: 0,
        status: 'Created'
      };
      mockEvents.push(newEvent);
      return newEvent;
    }
  },
  photos: {
    uploadPhotos: async (eventId, files, onProgress) => {
      for (let i = 0; i <= 100; i += 10) {
        await delay(300);
        if (onProgress) onProgress(i);
      }
      return { success: true, count: files.length };
    },
    findMatchingPhotos: async (eventId, faceImageBlob) => {
      await delay(3000); // Simulate AI processing
      return mockPhotos;
    }
  }
};
