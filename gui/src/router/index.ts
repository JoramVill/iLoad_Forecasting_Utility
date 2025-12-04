import { createRouter, createWebHashHistory } from 'vue-router'
import TrainView from '../views/TrainView.vue'
import ForecastView from '../views/ForecastView.vue'
import EvaluateView from '../views/EvaluateView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/train'
    },
    {
      path: '/train',
      name: 'train',
      component: TrainView
    },
    {
      path: '/forecast',
      name: 'forecast',
      component: ForecastView
    },
    {
      path: '/evaluate',
      name: 'evaluate',
      component: EvaluateView
    }
  ]
})

export default router
