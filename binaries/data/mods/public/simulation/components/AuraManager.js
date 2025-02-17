function AuraManager() {}

AuraManager.prototype.Schema =
	"<a:component type='system'/><empty/>";

AuraManager.prototype.Init = function()
{
	this.modificationsCache = new Map();
	this.modifications = new Map();
	this.templateModificationsCache = new Map();
	this.templateModifications = new Map();
};

AuraManager.prototype.ensureExists = function(name, value, id, key, defaultData)
{
	var cacheName = name + "Cache";
	var v = this[name].get(value);
	if (!v)
	{
		v = new Map();
		this[name].set(value, v);
		this[cacheName].set(value, new Map());
	}

	var i = v.get(id);
	if (!i)
	{
		i = new Map();
		v.set(id, i);
		this[cacheName].get(value).set(id, defaultData);
	}

	var k = i.get(key);
	if (!k)
	{
		k = [];
		i.set(key, k);
	}
	return k;
};

AuraManager.prototype.ApplyBonus = function(value, ents, data, key)
{
	for (let ent of ents)
	{
		var dataList = this.ensureExists("modifications", value, ent, key, { "add":0, "multiply":1 });

		// Clone the data object to prevent references and serialization issues
		dataList.push(clone(data));

		if (dataList.length > 1)
			continue;

		// first time added this aura
		if (data.add)
			this.modificationsCache.get(value).get(ent).add += data.add;
		if (data.multiply)
			this.modificationsCache.get(value).get(ent).multiply *= data.multiply;

		// post message to the entity to notify it about the change
		Engine.PostMessage(ent, MT_ValueModification, {
			"entities": [ent],
			"component": value.split("/")[0],
			"valueNames": [value]
		});
	}
};

AuraManager.prototype.ApplyTemplateBonus = function(value, player, classes, data, key)
{
	var dataList = this.ensureExists("templateModifications", value, player, key, new Map());

	// Clone the data object to prevent references and serialization issues
	dataList.push(clone(data));

	if (dataList.length > 1)
		return;

	// first time added this aura
	let cache = this.templateModificationsCache.get(value).get(player);
	if (!cache.get(classes))
		cache.set(classes, new Map());

	if (!cache.get(classes).get(key))
		cache.get(classes).set(key, { "add": 0, "multiply": 1 });

	if (data.add)
		cache.get(classes).get(key).add += data.add;
	if (data.multiply)
		cache.get(classes).get(key).multiply *= data.multiply;

	Engine.PostMessage(SYSTEM_ENTITY, MT_TemplateModification, {
		"player": player,
		"component": value.split("/")[0],
		"valueNames": [value]
	});
};

AuraManager.prototype.RemoveBonus = function(value, ents, key)
{
	var v = this.modifications.get(value);
	if (!v)
		return;

	for (let ent of ents)
	{
		var e = v.get(ent);
		if (!e)
			continue;
		var dataList = e.get(key);
		if (!dataList || !dataList.length)
			continue;

		// get the applied data to remove again
		var data = dataList.pop();

		if (dataList.length > 0)
			continue;

		// out of last aura of this kind, remove modifications
		if (data.add)
			this.modificationsCache.get(value).get(ent).add -= data.add;

		if (data.multiply)
			this.modificationsCache.get(value).get(ent).multiply /= data.multiply;

		// post message to the entity to notify it about the change
		Engine.PostMessage(ent, MT_ValueModification, {
			"entities": [ent],
			"component": value.split("/")[0],
			"valueNames": [value]
		});
	}
};

AuraManager.prototype.RemoveTemplateBonus = function(value, player, classes, key)
{
	var v = this.templateModifications.get(value);
	if (!v)
		return;
	var p = v.get(player);
	if (!p)
		return;
	var dataList = p.get(key);
	if (!dataList || !dataList.length)
		return;

	dataList.pop();

	if (dataList.length > 0)
		return;

	this.templateModificationsCache.get(value).get(player).get(classes).get(key).add = 0;
	this.templateModificationsCache.get(value).get(player).get(classes).get(key).multiply = 1;

	Engine.PostMessage(SYSTEM_ENTITY, MT_TemplateModification, {
		"player": player,
		"component": value.split("/")[0],
		"valueNames": [value]
	});
};

AuraManager.prototype.ApplyModifications = function(valueName, value, ent)
{
	var v = this.modificationsCache.get(valueName);
	if (!v)
		return value;
	var cache = v.get(ent);
	if (!cache)
		return value;

	value *= cache.multiply;
	value += cache.add;
	return value;
};

AuraManager.prototype.ApplyTemplateModifications = function(valueName, value, player, template)
{
	var v = this.templateModificationsCache.get(valueName);
	if (!v)
		return value;
	var cache = v.get(player);
	if (!cache)
		return value;

	if (!template || !template.Identity)
		return value;
	var classes = GetIdentityClasses(template.Identity);

	var usedKeys = new Set();
	var add = 0;
	var multiply = 1;
	for (let [className, mods] of cache)
	{
		if (!MatchesClassList(classes, className))
			continue;

		for (let [key, mod] of mods)
		{
			// don't add an aura with the same key twice
			if (usedKeys.has(key))
				continue;
			add += mod.add;
			multiply *= mod.multiply;
			usedKeys.add(key);
		}
	}
	return value * multiply + add;
};

Engine.RegisterSystemComponentType(IID_AuraManager, "AuraManager", AuraManager);
