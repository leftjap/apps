// ═════════════════════════════════════════════════════════════════════════
// APP — 운영 라우터 (DesignCanvas 대체)
//   전역 go/back/goRoot + 히스토리 스택. 화면은 .app-root 에 풀뷰포트로 렌더.
//   네비게이션 규칙은 작업지시서 §4.1 표.
// ═════════════════════════════════════════════════════════════════════════

// view key → window 에 등록된 화면 컴포넌트 이름
const ROUTES = {
 feed: 'ScrFeedV14',
 'feed-v15': 'ScrFeedV15',
 stats: 'ScrStatsV14',
 thread: 'ScrThreadV14',
 word: 'ScrWordV14',
 day: 'ScrDayV14',
 author: 'ScrAuthorV14',
 book: 'ScrBookV14',
 'book-v15': 'ScrBookV15',
 allBooks: 'ScrAllBooksV14',
 allAuthors: 'ScrAllAuthorsV14',
 allPubs: 'ScrAllPubsV14',
 allPins: 'ScrAllPinsV14',
 add: 'ScrAddV14',
 edit: 'ScrEditV14',
 delete: 'ScrDeleteV14',
 pin: 'ScrPinV14',
 comment: 'ScrCommentPostedV14',
};

let _setStack = null;
const go = (view, params) => { if (_setStack && ROUTES[view]) _setStack(s => [...s, { view, params: params || {} }]); };
const back = () => { if (_setStack) _setStack(s => (s.length > 1 ? s.slice(0, -1) : s)); };
const goRoot = (view, params) => { if (_setStack) _setStack([{ view: view || 'feed', params: params || {} }]); };

const BookApp = () => {
 const [stack, setStack] = React.useState([{ view: 'feed-v15', params: {} }]);
 _setStack = setStack;
 const cur = stack[stack.length - 1];
 const name = ROUTES[cur.view] || ROUTES.feed;
 const Screen = window[name];

 React.useEffect(() => {
  // 화면 전환 시 main 스크롤을 맨 위로
  const m = document.querySelector('.app-root > .bk > main');
  if (m) m.scrollTop = 0;
 }, [cur.view, JSON.stringify(cur.params)]);

 if (!Screen) return <div style={{ padding: 40 }}>화면을 찾을 수 없습니다: {cur.view}</div>;
 return (
  <div className="app-root">
   <Screen key={cur.view + ':' + JSON.stringify(cur.params)} {...cur.params} />
  </div>
 );
};

Object.assign(window, { go, back, goRoot, ROUTES });
ReactDOM.createRoot(document.getElementById('root')).render(<BookApp />);
