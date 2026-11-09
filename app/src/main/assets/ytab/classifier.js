// 광고 텍스트(광고주명·제목·도메인)를 보고 카테고리를 추정하는 규칙 기반 분류기.
// 페이지(MAIN world)와 팝업 양쪽에서 함께 씁니다.
(function (root) {
  'use strict';

  const CATEGORIES = [
    { id: 'game', name: '게임', words: ['게임', 'game', 'rpg', 'mmorpg', '모바일게임', '사전예약', '사전 예약', '플레이', 'play now', '리니지', '던전', '전투', '길드', '가챠', '방치형', 'steam', 'nexon', '넥슨', '넷마블', 'ncsoft', '엔씨', '크래프톤', '스마일게이트', 'supercell', 'hoyoverse'] },
    { id: 'finance', name: '금융·보험·투자', words: ['보험', '대출', '카드', '은행', 'bank', '증권', '주식', '투자', '코인', '비트코인', 'crypto', '재테크', '적금', '금리', '연금', '토스', '카카오뱅크', '케이뱅크', '삼성생명', '보장', '신용', 'loan', 'insurance', 'invest'] },
    { id: 'shopping', name: '쇼핑·커머스', words: ['쇼핑', '할인', '세일', 'sale', '특가', '최저가', '쿠폰', '무료배송', '쿠팡', 'coupang', '11번가', 'g마켓', '지마켓', '테무', 'temu', '알리', 'aliexpress', '무신사', '오늘의집', '29cm', 'shop', 'store', '구매', '주문'] },
    { id: 'beauty', name: '뷰티·패션', words: ['화장품', '뷰티', 'beauty', '스킨', '세럼', '크림', '쿠션', '립', '향수', '헤어', '탈모', '패션', '옷', '신발', '가방', '올리브영', '이니스프리', '설화수', 'fashion', 'skincare'] },
    { id: 'food', name: '식품·배달·외식', words: ['배달', '배민', '배달의민족', '요기요', '쿠팡이츠', '치킨', '피자', '버거', '맥도날드', '버거킹', '커피', '스타벅스', '음료', '맥주', '라면', '과자', '식품', '밀키트', '마켓컬리', '컬리', 'food', 'delivery'] },
    { id: 'education', name: '교육·자격증', words: ['강의', '인강', '교육', '학원', '자격증', '공무원', '토익', '영어회화', '코딩', '부트캠프', '수능', '메가스터디', '해커스', '에듀윌', '클래스101', '패스트캠퍼스', 'class', 'course', 'learn'] },
    { id: 'app', name: '앱·IT·서비스', words: ['앱', 'app', '다운로드', 'download', '설치', '구독', '클라우드', 'ai', '인공지능', '스마트폰', '갤럭시', 'galaxy', 'iphone', '아이폰', '노트북', '삼성', 'samsung', 'apple', 'lg', '통신', 'skt', 'kt', 'lg u+', '요금제', '알뜰폰', 'vpn'] },
    { id: 'car', name: '자동차', words: ['자동차', '신차', '시승', '현대자동차', '기아', 'kia', 'hyundai', '제네시스', 'genesis', 'bmw', '벤츠', 'tesla', '테슬라', '전기차', 'suv', '렌터카', '중고차', '엔카', '타이어'] },
    { id: 'travel', name: '여행·숙박', words: ['여행', '항공', '항공권', '호텔', '숙소', '숙박', '야놀자', '여기어때', '아고다', 'agoda', 'booking', '에어비앤비', 'airbnb', '트립닷컴', '대한항공', '아시아나', '제주', '패키지'] },
    { id: 'health', name: '건강·의료·다이어트', words: ['건강', '영양제', '유산균', '비타민', '다이어트', '체중', '병원', '의원', '치과', '성형', '피부과', '한의원', '약국', '헬스', '필라테스', '탈모치료', '건강기능식품'] },
    { id: 'realestate', name: '부동산·인테리어', words: ['부동산', '아파트', '분양', '청약', '오피스텔', '직방', '다방', '인테리어', '이사', '리모델링', '가구', '침대', '매트리스'] },
    { id: 'media', name: '엔터·콘텐츠', words: ['영화', '개봉', '드라마', '넷플릭스', 'netflix', '디즈니', 'disney', '티빙', 'tving', '웨이브', '쿠팡플레이', '웹툰', '웹소설', '카카오페이지', '네이버웹툰', '리디', '콘서트', '앨범', '공연', 'music'] }
  ];

  const OTHER = { id: 'other', name: '기타·미분류' };

  function classify(info) {
    const text = [info.advertiser, info.title, info.author, info.domain, info.extra]
      .filter(Boolean).join(' ').toLowerCase();
    if (!text.trim()) return { id: OTHER.id, name: OTHER.name, score: 0, hits: [] };

    let best = null;
    for (const cat of CATEGORIES) {
      const hits = cat.words.filter(w => text.includes(w.toLowerCase()));
      // 긴 단어가 맞으면 더 확실한 신호로 봅니다.
      const score = hits.reduce((s, w) => s + Math.min(3, Math.ceil(w.length / 2)), 0);
      if (score > 0 && (!best || score > best.score)) best = { id: cat.id, name: cat.name, score, hits };
    }
    return best || { id: OTHER.id, name: OTHER.name, score: 0, hits: [] };
  }

  function categoryName(id) {
    if (id === OTHER.id) return OTHER.name;
    const c = CATEGORIES.find(c => c.id === id);
    return c ? c.name : id;
  }

  root.YTAB_CLASSIFIER = {
    classify,
    categoryName,
    categories: CATEGORIES.map(c => ({ id: c.id, name: c.name })).concat([OTHER])
  };
})(typeof window !== 'undefined' ? window : globalThis);
