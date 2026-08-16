// 화성특례시 통합 장소 데이터
const PLACES = [
  // ── 관광지
  { id: 1,  name: '공룡알 화석산지',      category: 'tourist',       lat: 37.08549, lng: 126.81165, address: '화성시 송산면 고정리',           tags: ['자연', '유네스코', '세계문화유산'],  desc: '세계 최대 규모의 중생대 공룡알 화석 산지. 유네스코 세계자연유산 잠정목록 등재.' },
  { id: 2,  name: '궁평항',               category: 'tourist',       lat: 37.13480, lng: 126.62340, address: '화성시 서신면 궁평리 1101',        tags: ['바다', '낙조', '해산물'],            desc: '서해안 낙조 명소. 매년 가을 낙조축제가 열리며 신선한 해산물로 유명.' },
  { id: 3,  name: '제부도',               category: 'tourist',       lat: 37.18527, lng: 126.62850, address: '화성시 서신면 제부리',             tags: ['섬', '바다', '드라이브'],            desc: '하루 두 번 바닷길이 열리는 화성의 대표 관광 섬.' },
  { id: 4,  name: '우리꽃 식물원',        category: 'tourist',       lat: 37.18891, lng: 126.71428, address: '화성시 마도면 청원리 196',         tags: ['자연', '꽃', '산책'],                desc: '우리나라 자생 식물을 주제로 한 생태 식물원.' },
  { id: 5,  name: '화성 융건릉',          category: 'tourist',       lat: 37.21282, lng: 126.93584, address: '화성시 효행로 481번길 21',         tags: ['역사', '세계문화유산', '왕릉'],      desc: '사도세자(장조)와 정조의 왕릉. 유네스코 세계문화유산.' },
  { id: 6,  name: '매향리 평화역사관',    category: 'tourist',       lat: 37.16580, lng: 126.68920, address: '화성시 우정읍 매향리 1090',        tags: ['역사', '평화'],                      desc: '50년간 미군 사격장으로 사용된 쿠니사격장의 역사를 담은 평화박물관.' },
  { id: 7,  name: '전곡항',               category: 'tourist',       lat: 37.18420, lng: 126.65460, address: '화성시 우정읍 조암리',            tags: ['바다', '항구', '낚시'],              desc: '요트와 낚시로 유명한 서해안 마리나 항구.' },

  // ── 맛집
  { id: 8,  name: '궁평항 수산시장',      category: 'restaurant',    lat: 37.13500, lng: 126.62400, address: '화성시 서신면 궁평리',            tags: ['해산물', '회', '가맹점'],            desc: '궁평항에서 잡은 싱싱한 활어와 조개구이.' },
  { id: 9,  name: '항남 왕갈비집',        category: 'restaurant',    lat: 37.22350, lng: 126.83100, address: '화성시 향남읍 행정중앙로',         tags: ['한식', '갈비', '가맹점'],            desc: '30년 전통 향남 대표 왕갈비 맛집.' },
  { id: 10, name: '남양 딸기 카페',       category: 'restaurant',    lat: 37.19200, lng: 126.78250, address: '화성시 남양읍 남양리',            tags: ['카페', '딸기', '디저트'],            desc: '화성 남양 딸기 특산품을 활용한 디저트 카페.' },
  { id: 11, name: '제부도 조개구이거리',  category: 'restaurant',    lat: 37.18500, lng: 126.62900, address: '화성시 서신면 제부리',            tags: ['해산물', '조개', '가맹점'],          desc: '제부도 해변을 따라 이어진 싱싱한 조개구이 골목.' },
  { id: 12, name: '동탄 먹자골목',        category: 'restaurant',    lat: 37.20800, lng: 127.07100, address: '화성시 동탄면 동탄대로',          tags: ['다양함', '야식', '가맹점'],          desc: '동탄 신도시 대표 먹자거리.' },

  // ── 축제
  { id: 13, name: '궁평항 낙조 축제',     category: 'festival',      lat: 37.13480, lng: 126.62340, address: '화성시 서신면 궁평항 일원',       tags: ['축제', '낙조', '진행중'],            desc: '서해 낙조를 배경으로 열리는 화성 대표 가을 축제.', date: '2026-09-20 ~ 2026-09-22', status: 'ongoing' },
  { id: 14, name: '공룡알화석지 야행',    category: 'festival',      lat: 37.08549, lng: 126.81165, address: '화성시 송산면 공룡알화석지 일원',  tags: ['축제', '야간', '예정'],              desc: '공룡알 화석지를 야간에 탐방하는 특별 행사.', date: '2026-10-10 ~ 2026-10-12', status: 'upcoming' },
  { id: 15, name: '매향리 평화 축제',     category: 'festival',      lat: 37.16580, lng: 126.68920, address: '화성시 우정읍 매향리',            tags: ['축제', '문화', '예정'],              desc: '평화와 화합을 주제로 한 지역 문화 축제.', date: '2026-11-01 ~ 2026-11-03', status: 'upcoming' },
  { id: 16, name: '제부도 해양 페스타',   category: 'festival',      lat: 37.18527, lng: 126.62850, address: '화성시 서신면 제부도',            tags: ['축제', '해양', '예정'],              desc: '제부도 바닷길 개방 시간에 맞춘 해양 체험 축제.', date: '2026-08-23 ~ 2026-08-25', status: 'upcoming' },

  // ── 주차장
  { id: 17, name: '궁평항 공영주차장',    category: 'parking',       lat: 37.13490, lng: 126.62310, address: '화성시 서신면 궁평리',            tags: ['무료', '공영', '300면'],             desc: '궁평항 인근 무료 공영주차장. 300면 규모.' },
  { id: 18, name: '제부도 공영주차장',    category: 'parking',       lat: 37.18540, lng: 126.62870, address: '화성시 서신면 제부리',            tags: ['유료', '공영'],                      desc: '제부도 입구 공영주차장. 성수기 혼잡.' },
  { id: 19, name: '동탄역 환승주차장',    category: 'parking',       lat: 37.20090, lng: 127.07330, address: '화성시 동탄면 동탄대로',          tags: ['유료', '환승', '대규모'],            desc: 'SRT 동탄역 인근 환승 주차장.' },
  { id: 20, name: '향남 공영주차장',      category: 'parking',       lat: 37.22370, lng: 126.83120, address: '화성시 향남읍 행정중앙로',         tags: ['무료', '공영'],                      desc: '향남읍 행정복지센터 인근 무료 공영주차장.' },
  { id: 21, name: '공룡알화석지 주차장',  category: 'parking',       lat: 37.08560, lng: 126.81180, address: '화성시 송산면 고정리',            tags: ['무료', '공영'],                      desc: '공룡알화석산지 탐방안내소 앞 무료 주차장.' },

  // ── 지역화폐 가맹점
  { id: 22, name: '향남 전통시장',        category: 'localcurrency', lat: 37.22200, lng: 126.83050, address: '화성시 향남읍 향남로',            tags: ['시장', '전통', '가맹점'],            desc: '향남 전통시장 내 화성사랑카드 가맹 점포 다수.' },
  { id: 23, name: '동탄 반찬 공방',       category: 'localcurrency', lat: 37.21000, lng: 127.06500, address: '화성시 동탄면 동탄대로',          tags: ['반찬', '소상공인', '가맹점'],        desc: '화성사랑카드 가맹 반찬 전문점.' },
  { id: 24, name: '남양 정육 직판장',     category: 'localcurrency', lat: 37.19240, lng: 126.78280, address: '화성시 남양읍 남양리',            tags: ['정육', '소상공인', '가맹점'],        desc: '화성사랑카드 가맹 정육 직판장.' },
  { id: 25, name: '궁평항 편의점',        category: 'localcurrency', lat: 37.13510, lng: 126.62350, address: '화성시 서신면 궁평리',            tags: ['편의점', '가맹점'],                  desc: '화성사랑카드 가맹 편의점.' },
];

// 카테고리 설정
const CATEGORY_CONFIG = {
  tourist:       { label: '관광지',      color: '#7C3AED', bg: '#EDE9FE', emoji: '🏛' },
  restaurant:    { label: '맛집',        color: '#D97706', bg: '#FEF3C7', emoji: '🍽' },
  festival:      { label: '축제',        color: '#DC2626', bg: '#FEE2E2', emoji: '🎉' },
  parking:       { label: '주차장',      color: '#2563EB', bg: '#DBEAFE', emoji: '🅿' },
  localcurrency: { label: '지역화폐',    color: '#059669', bg: '#D1FAE5', emoji: '💳' },
};

// 축제 캘린더 데이터
const FESTIVALS = PLACES.filter(p => p.category === 'festival');
