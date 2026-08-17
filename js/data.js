// 화성특례시 통합 장소 데이터
// 실제 데이터는 별도 파일로 제공받아 추가 예정
const PLACES = [];

// 카테고리 설정
const CATEGORY_CONFIG = {
  tourist:       { label: '관광지',   color: '#7C3AED', bg: '#EDE9FE', emoji: '🏛' },
  restaurant:    { label: '맛집',     color: '#D97706', bg: '#FEF3C7', emoji: '🍽' },
  festival:      { label: '축제',     color: '#DC2626', bg: '#FEE2E2', emoji: '🎉' },
  parking:       { label: '주차장',   color: '#2563EB', bg: '#DBEAFE', emoji: '🅿' },
  localcurrency: { label: '지역화폐', color: '#059669', bg: '#D1FAE5', emoji: '💳' },
};

const FESTIVALS = PLACES.filter(p => p.category === 'festival');
