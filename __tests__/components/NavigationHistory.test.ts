import { TabRouter } from 'expo-router/build/react-navigation/routers/TabRouter';

it('returns category editors to Settings instead of the initial Overview tab', () => {
  const router = TabRouter({ backBehavior: 'history', initialRouteName: 'index' });
  const options = { routeNames: ['index', 'settings', 'category/[id]'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  state = router.getRehydratedState(router.getStateForAction(state, { type: 'NAVIGATE', payload: { name: 'settings' } }, options)!, options);
  for (const id of ['groceries', 'rent']) {
    state = router.getRehydratedState(router.getStateForAction(state, { type: 'NAVIGATE', payload: { name: 'category/[id]', params: { id } } }, options)!, options);
    expect(state.routes[state.index].name).toBe('category/[id]');
    state = router.getRehydratedState(router.getStateForAction(state, { type: 'GO_BACK' }, options)!, options);
    expect(state.routes[state.index].name).toBe('settings');
  }
});

