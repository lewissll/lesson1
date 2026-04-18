'use client'

import { useState, useEffect } from 'react'

interface StockPrice {
  symbol: string
  price: number | null
  previousPrice: number | null
  change: number | null
  costPrice?: number
}

interface CryptoPrice {
  price: number | null
  previousPrice: number | null
  change: number | null
  costPrice?: number
}

export default function Home() {
  const [btcData, setBtcData] = useState<CryptoPrice>({ price: null, previousPrice: null, change: null, costPrice: 65000 })
  const [stocks, setStocks] = useState<StockPrice[]>([
    { symbol: 'TSLA', price: null, previousPrice: null, change: null, costPrice: 240 },
    { symbol: 'NVDA', price: null, previousPrice: null, change: null },
    { symbol: 'AMD', price: null, previousPrice: null, change: null },
    { symbol: 'INTC', price: null, previousPrice: null, change: null },
    { symbol: 'AMZN', price: null, previousPrice: null, change: null },
    { symbol: 'GOOGL', price: null, previousPrice: null, change: null },
    { symbol: 'QQQ', price: null, previousPrice: null, change: null },
    { symbol: 'AAPL', price: null, previousPrice: null, change: null }
  ])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [alertsEnabled, setAlertsEnabled] = useState(false)

  const fetchBTCPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.bitcoin || data.bitcoin.usd === undefined) {
        throw new Error('Invalid API response format')
      }
      
      const newPrice = data.bitcoin.usd
      
      setBtcData(prev => {
        const change = prev.price && prev.price !== 0 ? newPrice - prev.price : 0
        return {
          price: newPrice,
          previousPrice: prev.price,
          change: change,
          costPrice: prev.costPrice
        }
      })
    } catch (error) {
      console.error('Error fetching BTC price:', error.message || error)
      // Don't update state on error to preserve previous data
    }
  }

  const fetchStockPrices = async () => {
    try {
      // Finnhub returns individual quotes, so we need to fetch each stock separately
      const stockPromises = stocks.map(async (stock) => {
        try {
          const stockResponse = await fetch(`https://finnhub.io/api/v1/quote?symbol=${stock.symbol}&token=${process.env.NEXT_PUBLIC_FINNHUB_API_KEY}`)
          const stockData = await stockResponse.json()
          const newPrice = stockData.c
          
          // Calculate change based on current price in state
          const currentStock = stocks.find(s => s.symbol === stock.symbol)
          const change = currentStock && currentStock.price && currentStock.price !== 0 ? newPrice - currentStock.price : 0
          
          return {
            ...stock,
            price: newPrice,
            previousPrice: currentStock?.price || null,
            change: change
          }
        } catch (error) {
          console.error(`Error fetching ${stock.symbol} price:`, error)
          return stock
        }
      })
      
      const updatedStocks = await Promise.all(stockPromises)
      setStocks(updatedStocks)
    } catch (error) {
      console.error('Error fetching stock prices:', error)
    }
  }

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchBTCPrice(), fetchStockPrices()])
      setLastUpdated(new Date().toLocaleString('zh-TW'))
      checkPriceAlerts()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchAllData()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [autoRefresh])

  const getPriceColor = (change: number | null) => {
    if (change === null || change === 0) return 'text-gray-400'
    return change > 0 ? 'text-green-400' : 'text-red-400'
  }

  const calculateProfitLoss = (currentPrice: number | null, costPrice: number | undefined) => {
    if (!currentPrice || !costPrice) return { percentage: 0, amount: 0 }
    const percentage = ((currentPrice - costPrice) / costPrice) * 100
    const amount = currentPrice - costPrice
    return { percentage, amount }
  }

  const getProfitLossColor = (percentage: number) => {
    if (percentage === 0) return 'text-gray-400'
    return percentage > 0 ? 'text-green-400' : 'text-red-400'
  }

  const formatProfitLoss = (percentage: number) => {
    return `${percentage > 0 ? '+' : ''}${percentage.toFixed(2)}%`
  }

  const calculateOverallPerformance = () => {
    const assets = [
      { price: btcData.price, costPrice: btcData.costPrice },
      { price: stocks.find(s => s.symbol === 'TSLA')?.price, costPrice: 240 }
    ].filter(asset => asset.price && asset.costPrice)
    
    if (assets.length === 0) return 0
    
    const totalPercentage = assets.reduce((sum, asset) => {
      const { percentage } = calculateProfitLoss(asset.price, asset.costPrice)
      return sum + percentage
    }, 0)
    
    return totalPercentage / assets.length
  }

  const formatPrice = (price: number | null) => {
    if (price === null) return '--'
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setAlertsEnabled(true)
        return true
      } else {
        alert('Please allow notification permissions to receive price alerts')
        return false
      }
    } else {
      alert('Your browser does not support notification features')
      return false
    }
  }

  const sendPriceAlert = (symbol: string, price: number, changePercent: number) => {
    try {
      if (alertsEnabled && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Large fluctuation detected!', {
          body: `${symbol} current price is ${formatPrice(price)}, change ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
          icon: '/'
        })
      }
    } catch (error) {
      console.error('Notification error:', error)
    }
  }

  const checkPriceAlerts = () => {
    if (!alertsEnabled) return

    // Check Bitcoin alert (>1% change)
    if (btcData.price && btcData.costPrice) {
      const btcChange = calculateProfitLoss(btcData.price, btcData.costPrice).percentage
      if (Math.abs(btcChange) > 1) {
        sendPriceAlert('Bitcoin (BTC)', btcData.price, btcChange)
      }
    }

    // Check TSLA alert (>2% change)
    const tslaStock = stocks.find(s => s.symbol === 'TSLA')
    if (tslaStock?.price && tslaStock.costPrice) {
      const tslaChange = calculateProfitLoss(tslaStock.price, tslaStock.costPrice).percentage
      if (Math.abs(tslaChange) > 2) {
        sendPriceAlert('TSLA', tslaStock.price, tslaChange)
      }
    }
  }

  return (
    <main className="min-h-screen bg-blue-900 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold text-white text-center mb-6 sm:mb-8">
          {'\u6211\u7684\u8cc7\u7522\u76e3\u63a7\u7ad9'}
        </h1>
        
        <div className="flex justify-center mb-6">
          <div className="bg-blue-800/60 backdrop-blur-sm rounded-lg px-4 sm:px-8 py-3 sm:py-4 border border-blue-400/30 shadow-2xl">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-300 mb-2 text-center">{'\u4eca\u65e5\u76c8\u8667\u6982\u89c8'}</h2>
            <div className={`text-2xl sm:text-3xl font-bold text-center ${getProfitLossColor(calculateOverallPerformance())}`}>
              {formatProfitLoss(calculateOverallPerformance())}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-4 mb-6">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 sm:px-6 py-2 rounded-lg font-semibold transition-colors text-sm sm:text-base ${
              autoRefresh 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            {autoRefresh ? '\u81ea\u52d5\u5237\u65b0: \u958b\u555f (30\u79d2)' : '\u81ea\u52d5\u5237\u65b0: \u95dc\u9589'}
          </button>
          
          <button
            onClick={alertsEnabled ? () => setAlertsEnabled(false) : requestNotificationPermission}
            className={`px-4 sm:px-6 py-2 rounded-lg font-semibold transition-colors text-sm sm:text-base ${
              alertsEnabled 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            }`}
          >
            {alertsEnabled ? '\u8b66\u5831\u901a\u77e5: \u5df2\u958b\u555f' : '\u958b\u555f\u8b66\u5831\u901a\u77e5'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
          {/* Crypto Section */}
          <div className="bg-blue-800/60 backdrop-blur-sm rounded-lg p-4 sm:p-6 border border-blue-400/30 shadow-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-300 mb-4 sm:mb-6 text-center">
              {'\u52a0\u5bc6\u8ca8\u5e63'}
            </h2>
            <div className="space-y-4">
              <div className="bg-blue-800/50 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-blue-400/20 shadow-xl">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg sm:text-xl text-gray-300">Bitcoin (BTC)</h3>
                  {loading && <div className="text-sm text-gray-400">{'\u66f4\u65b0\u4e2d...'}</div>}
                </div>
                <div className={`text-2xl sm:text-3xl font-bold ${getPriceColor(btcData.change)}`}>
                  {formatPrice(btcData.price)}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  {'\u6210\u672c\u50f9: '}{btcData.costPrice ? formatPrice(btcData.costPrice) : '--'}
                </div>
                {btcData.price && btcData.costPrice && (
                  <div className={`text-sm mt-1 font-semibold ${getProfitLossColor(calculateProfitLoss(btcData.price, btcData.costPrice).percentage)}`}>
                    {formatProfitLoss(calculateProfitLoss(btcData.price, btcData.costPrice).percentage)}
                  </div>
                )}
                {btcData.change !== null && btcData.change !== 0 && (
                  <div className={`text-xs mt-1 ${getPriceColor(btcData.change)}`}>
                    {'\u5373\u6642\u8b8a\u52d5: '}{btcData.change > 0 ? '+' : ''}{btcData.change.toFixed(2)} ({btcData.change && btcData.previousPrice ? ((btcData.change / btcData.previousPrice) * 100).toFixed(2) : '0.00'}%)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stocks Section */}
          <div className="bg-blue-800/60 backdrop-blur-sm rounded-lg p-4 sm:p-6 border border-blue-400/30 shadow-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-300 mb-4 sm:mb-6 text-center">
              {'\u7f8e\u80a1'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stocks.map((stock) => {
                const profitLoss = stock.costPrice ? calculateProfitLoss(stock.price, stock.costPrice) : null
                return (
                  <div key={stock.symbol} className="bg-blue-800/40 backdrop-blur-sm rounded-lg p-3 border border-blue-400/15">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="text-sm font-semibold text-gray-300">{stock.symbol}</h3>
                      {loading && <div className="text-xs text-gray-400">...</div>}
                    </div>
                    <div className={`text-lg font-bold ${getPriceColor(stock.change)}`}>
                      {formatPrice(stock.price)}
                    </div>
                    {stock.costPrice && (
                      <div className="text-xs text-gray-400">
                        {'\u6210\u672c: '}{formatPrice(stock.costPrice)}
                      </div>
                    )}
                    {profitLoss && (
                      <div className={`text-xs font-semibold ${getProfitLossColor(profitLoss.percentage)}`}>
                        {formatProfitLoss(profitLoss.percentage)}
                      </div>
                    )}
                    {stock.change !== null && stock.change !== 0 && (
                      <div className={`text-xs ${getPriceColor(stock.change)}`}>
                        {'\u5373\u6642: '}{stock.change > 0 ? '+' : ''}{stock.change.toFixed(2)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-3 px-6 sm:px-8 rounded-lg transition-colors duration-200 mb-4 text-sm sm:text-base"
          >
            {loading ? '\u66f4\u65b0\u4e2d...' : '\u624b\u52d5\u5237\u65b0'}
          </button>
          
          {lastUpdated && (
            <div className="block text-gray-400 text-xs sm:text-sm mt-2">
              {'\u6700\u5f8c\u66f4\u65b0\u6642\u95f3: '}{lastUpdated}
            </div>
          )}
        </div>
        
        <footer className="text-center mt-8 pb-4">
          <div className="text-gray-500 text-xs sm:text-sm">
            {'\u6211\u7684\u79c1\u4eba\u91d1\u878d\u96f7\u8fbe v1.0'}
          </div>
        </footer>
      </div>
    </main>
  )
}
