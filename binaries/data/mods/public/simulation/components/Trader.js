// See helpers/TraderGain.js for the CalculateTaderGain() function which works out how many 
// resources a trader gets 

// Additional gain for ships for each garrisoned trader, in percents
const GARRISONED_TRADER_ADDITION = 20;

// Array of resource names
const RESOURCES = ["food", "wood", "stone", "metal"];

function Trader() {}

Trader.prototype.Schema =
	"<a:help>Lets the unit generate resouces while moving between markets (or docks in case of water trading).</a:help>" +
	"<a:example>" +
		"<MaxDistance>2.0</MaxDistance>" +
		"<GainMultiplier>1.0</GainMultiplier>" +
	"</a:example>" +
	"<element name='GainMultiplier' a:help='Additional gain multiplier'>" +
		"<ref name='positiveDecimal'/>" +
	"</element>";

Trader.prototype.Init = function()
{
	this.markets = [];
	this.index = -1;
	// Selected resource for trading
	this.requiredGoods = undefined;
	// Currently carried goods
	this.goods = { "type": null, "amount": null, "origin": null };
};

Trader.prototype.CalculateGain = function(currentMarket, nextMarket)
{
	let gain = CalculateTraderGain(currentMarket, nextMarket, this.template, this.entity);
	if (!gain)	// One of our markets must have been destroyed
		return null;

	// For ship increase gain for each garrisoned trader
	// Calculate this here to save passing unnecessary stuff into the CalculateTraderGain function
	var cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);
	if (cmpIdentity && cmpIdentity.HasClass("Ship"))
	{
		var cmpGarrisonHolder = Engine.QueryInterface(this.entity, IID_GarrisonHolder);
		if (cmpGarrisonHolder)
		{
			var garrisonMultiplier = 1;
			var garrisonedTradersCount = 0;
			for each (var entity in cmpGarrisonHolder.GetEntities())
			{
				var cmpGarrisonedUnitTrader = Engine.QueryInterface(entity, IID_Trader);
				if (cmpGarrisonedUnitTrader)
					garrisonedTradersCount++;
			}
			garrisonMultiplier *= 1 + GARRISONED_TRADER_ADDITION * garrisonedTradersCount / 100;

			if (gain.traderGain)
				gain.traderGain = Math.round(garrisonMultiplier * gain.traderGain);
			if (gain.market1Gain)
				gain.market1Gain = Math.round(garrisonMultiplier * gain.market1Gain);
			if (gain.market2Gain)
				gain.market2Gain = Math.round(garrisonMultiplier * gain.market2Gain);
		}
	}
	
	return gain;
};

// Set target as target market.
// Return true if at least one of markets was changed.
Trader.prototype.SetTargetMarket = function(target, source)
{
	// Check that target is a market
	var cmpTargetIdentity = Engine.QueryInterface(target, IID_Identity);
	if (!cmpTargetIdentity)
		return false;
	if (!cmpTargetIdentity.HasClass("Market") && !cmpTargetIdentity.HasClass("NavalMarket"))
		return false;

	if (source)
	{
		// Establish a trade route with both markets in one go.
		cmpTargetIdentity = Engine.QueryInterface(source, IID_Identity);
		if (!cmpTargetIdentity)
			return false;
		if (!cmpTargetIdentity.HasClass("Market") && !cmpTargetIdentity.HasClass("NavalMarket"))
			return false;
		this.markets = [source];
	}
	if (this.markets.length >= 2)
	{
		// If we already have both markets - drop them
		// and use the target as first market
		this.index = 0;
		this.markets = [target];
	}
	else if (this.markets.length == 1)
	{
		// If we have only one market and target is different from it,
		// set the target as second one
		if (target == this.markets[0])
			return false;
		else
		{
			this.index = 0;
			this.markets.push(target);
			this.goods.amount = this.CalculateGain(this.markets[0], this.markets[1]);
		}
	}
	else
	{
		// Else we don't have target markets at all,
		// set the target as first market
		this.index = 0;
		this.markets = [target];
	}
	// Drop carried goods if markets were changed
	this.goods.amount = null;
	return true;
};

Trader.prototype.GetFirstMarket = function()
{
	return this.markets[0] || null;
};

Trader.prototype.GetSecondMarket = function()
{
	return this.markets[1] || null;
};

Trader.prototype.HasBothMarkets = function()
{
	return this.markets.length >= 2;
};

Trader.prototype.GetRequiredGoods = function()
{
	return this.requiredGoods;
};

Trader.prototype.SetRequiredGoods = function(requiredGoods)
{
	// Check that argument is a correct resource name
	if (!requiredGoods || RESOURCES.indexOf(requiredGoods) == -1)
		this.requiredGoods = undefined;
	else
		this.requiredGoods = requiredGoods;
};

Trader.prototype.CanTrade = function(target)
{
	var cmpTraderIdentity = Engine.QueryInterface(this.entity, IID_Identity);
	var cmpTargetIdentity = Engine.QueryInterface(target, IID_Identity);
	// Check that the target exists
	if (!cmpTargetIdentity)
		return false;
	// Check that the target is not a foundation
	var cmpTargetFoundation = Engine.QueryInterface(target, IID_Foundation);
	if (cmpTargetFoundation)
		return false;
	var landTradingPossible = cmpTraderIdentity.HasClass("Organic") && cmpTargetIdentity.HasClass("Market");
	var seaTradingPossible = cmpTraderIdentity.HasClass("Ship") && cmpTargetIdentity.HasClass("NavalMarket");
	if (!landTradingPossible && !seaTradingPossible)
		return false;

	var cmpTraderPlayer = QueryOwnerInterface(this.entity, IID_Player);
	var traderPlayerId = cmpTraderPlayer.GetPlayerID();
	var cmpTargetPlayer = QueryOwnerInterface(target, IID_Player);
	var targetPlayerId = cmpTargetPlayer.GetPlayerID();
	var ownershipSuitableForTrading = cmpTraderPlayer.IsAlly(targetPlayerId) || cmpTraderPlayer.IsNeutral(targetPlayerId);
	if (!ownershipSuitableForTrading)
		return false;
	return true;
};

Trader.prototype.PerformTrade = function(currentMarket)
{
	let previousMarket = this.markets[(this.index+this.markets.length) % this.markets.length];
	if (previousMarket != currentMarket)  // Inconsistent markets
	{
		this.goods.amount = null;
		return;
	}

	this.index = ++this.index % this.markets.length;
	let nextMarket = this.markets[(this.index+this.markets.length) % this.markets.length];

	if (this.goods.amount && this.goods.amount.traderGain)
	{
		let cmpPlayer = QueryOwnerInterface(this.entity);
		if (cmpPlayer)
			cmpPlayer.AddResource(this.goods.type, this.goods.amount.traderGain);

		let cmpStatisticsTracker = QueryOwnerInterface(this.entity, IID_StatisticsTracker);
		if (cmpStatisticsTracker)
			cmpStatisticsTracker.IncreaseTradeIncomeCounter(this.goods.amount.traderGain);

		if (this.goods.amount.market1Gain)
		{
			cmpPlayer = QueryOwnerInterface(previousMarket);
			if (cmpPlayer)
				cmpPlayer.AddResource(this.goods.type, this.goods.amount.market1Gain);

			cmpStatisticsTracker = QueryOwnerInterface(previousMarket, IID_StatisticsTracker);
			if (cmpStatisticsTracker)
				cmpStatisticsTracker.IncreaseTradeIncomeCounter(this.goods.amount.market1Gain);
		}

		if (this.goods.amount.market2Gain)
		{
			cmpPlayer = QueryOwnerInterface(nextMarket);
			if (cmpPlayer)
				cmpPlayer.AddResource(this.goods.type, this.goods.amount.market2Gain);

			cmpStatisticsTracker = QueryOwnerInterface(nextMarket, IID_StatisticsTracker);
			if (cmpStatisticsTracker)
				cmpStatisticsTracker.IncreaseTradeIncomeCounter(this.goods.amount.market2Gain);
		}
	}

	// First take the preferred goods of the trader if any,
	// otherwise choose one according to the player's trading priorities
	// if still nothing (but should never happen), choose metal
	// and recomputes the gain in case it has changed (for example by technology)
	var nextGoods = this.GetRequiredGoods();
	if (!nextGoods || RESOURCES.indexOf(nextGoods) == -1)
	{
		let cmpPlayer = QueryOwnerInterface(this.entity);
		if (cmpPlayer)
			nextGoods = cmpPlayer.GetNextTradingGoods();

		if (!nextGoods || RESOURCES.indexOf(nextGoods) == -1)
			nextGoods = "metal";
	}
	this.goods.type = nextGoods;
	this.goods.amount = this.CalculateGain(currentMarket, nextMarket);
	this.goods.origin = currentMarket;
};

Trader.prototype.GetGoods = function()
{
	return this.goods;
};

Trader.prototype.StopTrading = function()
{
	this.index = -1;
	this.markets = [];
	// Drop carried goods
	this.goods.amount = null;
	// Reset markets
	this.markets = [];
};

// Get range in which deals with market are available,
// i.e. trader should be in no more than MaxDistance from market
// to be able to trade with it.
Trader.prototype.GetRange = function()
{
	var cmpObstruction = Engine.QueryInterface(this.entity, IID_Obstruction);
	var max = 1;
	if (cmpObstruction)
		max += cmpObstruction.GetUnitRadius()*1.5;
	return { "min": 0, "max": max};
};

Trader.prototype.OnGarrisonedUnitsChanged = function()
{
	if (this.HasBothMarkets())
		this.goods.amount = this.CalculateGain(this.markets[0], this.markets[1]);
};

Engine.RegisterComponentType(IID_Trader, "Trader", Trader);
