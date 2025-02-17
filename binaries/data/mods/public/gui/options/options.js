var g_HasCallback = false;
var g_Controls;

function init(data)
{
	if (data && data.callback)
		g_HasCallback = true;
	g_Controls = {};

	var options = Engine.ReadJSONFile("gui/options/options.json");
	for (let category of Object.keys(options))
	{
		let lastSize;
		for (let i = 0; i < options[category].length; ++i)
		{
			let option = options[category][i];
			if (!option.label || !option.parameters || !option.parameters.config)
				continue;
			let body = Engine.GetGUIObjectByName(category + "[" + i + "]");
			let label = Engine.GetGUIObjectByName(category + "Label[" + i + "]");
			let config = option.parameters.config;
			g_Controls[config] = {
				"control": setupControl(option, i, category),
				"type": option.type,
				"dependencies": option.dependencies || undefined,
				"parameters": option.parameters
			};
			label.caption = translate(option.label);
			label.tooltip = option.tooltip ? translate(option.tooltip) : "";
			// Move each element to the correct place.
			if (lastSize)
			{
				let newSize = new GUISize();
				newSize.left = lastSize.left;
				newSize.rright = lastSize.rright;
				newSize.top = lastSize.bottom;
				newSize.bottom = newSize.top + 26;
				body.size = newSize;
				lastSize = newSize;
			}
			else
				lastSize = body.size;
			// small right shift of options which depends on another one
			for (let opt of options[category])
			{
				if (!opt.label || !opt.parameters || !opt.parameters.config)
					continue;
				if (!opt.dependencies || opt.dependencies.indexOf(config) === -1)
					continue;
				label.caption = "      " + label.caption;
				break;
			}
			// Show element.
			body.hidden = false;
		}
	}

	updateOptionPanel();
}

/**
 * Setup the apropriate control for a given option.
 *
 * @param option Structure containing the data to setup an option.
 * @param prefix Prefix to use when accessing control, for example "generalSetting" when the tickbox name is generalSettingTickbox[i].
 */
function setupControl(option, i, category)
{
	var control;
	var onUpdate;
	var key = option.parameters.config;

	switch (option.type)
	{
	case "boolean":
	case "invertedboolean":
		// More space for the label
		let text = Engine.GetGUIObjectByName(category + "Label[" + i + "]");
		let size = text.size;
		size.rright = 87;
		text.size = size;
		control = Engine.GetGUIObjectByName(category + "Tickbox[" + i + "]");
		let checked;
		let keyRenderer;

		for (let param of Object.keys(option.parameters))
		{
			switch (param)
			{
			case "config":
				checked = Engine.ConfigDB_GetValue("user", key) === "true";
				break;
			case "renderer":
				keyRenderer = option.parameters.renderer;
				if (!Engine["Renderer_Get" + keyRenderer + "Enabled"])
				{
					warn("Invalid renderer key " + keyRenderer);
					keyRenderer = undefined;
					break;
				}
				if (Engine["Renderer_Get" + keyRenderer + "Enabled"]() !== checked)
				{
					warn("Incompatible renderer option value for " + keyRenderer);
					Engine["Renderer_Set" + keyRenderer + "Enabled"](checked);
				}
				break;
			default:
				warn("Unknown option source type '" + param + "'");
			}
		}
		// invertedboolean when we want to display the opposite of the flag value
		var inverted = option.type === "invertedboolean";
		if (inverted)
			checked = !checked;

		onUpdate = function(key, keyRenderer, inverted)
		{
			return function()
			{
				let val = inverted ? !this.checked : this.checked;
				if (keyRenderer)
					Engine["Renderer_Set" + keyRenderer + "Enabled"](val);
				Engine.ConfigDB_CreateValue("user", key, String(val));
				Engine.ConfigDB_SetChanges("user", true);
				updateOptionPanel();
			};
		}(key, keyRenderer, inverted);

		// Load final data to the control element.
		control.checked = checked;
		control.onPress = onUpdate;
		break;
	case "number":
		// TODO: Slider
	case "string":
		control = Engine.GetGUIObjectByName(category + "Input[" + i + "]");
		let caption;
		let functionBody;
		let minval;
		let maxval;

		for (let param of Object.keys(option.parameters))
		{
			switch (param)
			{
			case "config":
				caption = Engine.ConfigDB_GetValue("user", key);
				break;
			case "function":
				if (Engine[option.parameters.function])
					functionBody = option.parameters.function;
				break;
			case "min":
				minval = option.parameters.min;
				break;
			case "max":
				maxval = option.parameters.max;
				break;
			default:
				warn("Unknown option source type '" + param + "'");
			}
		}

		// as the enter key is not necessarily pressed after modifying an entry, we will register the input also
		// - when the mouse leave the control (MouseLeave event)
		// - or when saving or closing the window (registerChanges function)
		// so we must ensure that something has indeed been modified
		onUpdate = function(key, functionBody, minval, maxval)
		{
			return function()
			{
				if (minval && +minval > +this.caption)
					this.caption = minval;
				if (maxval && +maxval < +this.caption)
					this.caption = maxval;
				if (Engine.ConfigDB_GetValue("user", key) === this.caption)
					return;
				Engine.ConfigDB_CreateValue("user", key, this.caption);
				Engine.ConfigDB_SetChanges("user", true);
				if (functionBody)
					Engine[functionBody](+this.caption);
				updateOptionPanel();
			};
		}(key, functionBody, minval, maxval);

		control.caption = caption;
		control.onPress = onUpdate;
		control.onMouseLeave = onUpdate;
		break;
	case "dropdown":
		control = Engine.GetGUIObjectByName(category + "Dropdown[" + i + "]");
		control.onSelectionChange = function(){};  // just the time to setup the value

		for (let param of Object.keys(option.parameters))
		{
			switch (param)
			{
			case "config":
				let val = +Engine.ConfigDB_GetValue("user", key);
				if (key === "materialmgr.quality")
					val = val > 5 ? 2 : val > 2 ? 1 : 0;
				control.selected = val;
				break;
			case "list":
				control.list = option.parameters.list.map(e => translate(e));
				break;
			case "list_data":
				control.list_data = option.parameters.list_data;
				break;
			default:
				warn("Unknown option source type '" + param + "'");
			}
		}

		onUpdate = function(key)
		{
			return function()
			{
				let val = this.selected;
				if (key === "materialmgr.quality")
					val = val == 0 ? 2 : val == 1 ? 5 : 8;
				Engine.ConfigDB_CreateValue("user", key, val);
				Engine.ConfigDB_SetChanges("user", true);
				updateOptionPanel();
			};
		}(key);

		control.onSelectionChange = onUpdate;
		break;
	default:
		warn("Unknown option type " + option.type + ", assuming string.");
		control = Engine.GetGUIObjectByName(category + "Input[" + i + "]");
		break;
	}
	control.hidden = false;
	control.tooltip = option.tooltip ? translate(option.tooltip) : "";
	return control;
}

function updateOptionPanel()
{
	// Update dependencies
	for (let item in g_Controls)
	{
		let control = g_Controls[item];
		if (control.type !== "boolean" && control.type !== "invertedboolean" || !control.dependencies)
			continue;

		for (let dependency of control.dependencies)
			g_Controls[dependency].control.enabled = control.control.checked;
	}

	// And main buttons
	let hasChanges = Engine.ConfigDB_HasChanges("user");
	Engine.GetGUIObjectByName("revertChanges").enabled = hasChanges;
	Engine.GetGUIObjectByName("saveChanges").enabled = hasChanges;
}

/**
 * Register changes of input (text and number) controls
 */
function registerChanges()
{
	for (let item in g_Controls)
		if (g_Controls[item].type === "number" || g_Controls[item].type === "string")
			g_Controls[item].control.onPress();
}

function setDefaults()
{
	let btCaptions = [translate("No"), translate("Yes")];
	let btCode = [null, function(){ reallySetDefaults(); }];
	messageBox(500, 200, translate("Resetting the options will erase your saved settings. Do you want to continue?"),
		translate("Warning"), 0, btCaptions, btCode);
}

function reallySetDefaults()
{
	for (let item in g_Controls)
		Engine.ConfigDB_RemoveValue("user", item);

	Engine.ConfigDB_WriteFile("user", "config/user.cfg");
	revertChanges();
}

function revertChanges()
{
	Engine.ConfigDB_Reload("user");
	for (let item in g_Controls)
	{
		let control = g_Controls[item];
		// needs to update renderer values (which are all of boolean type)
		if (control.parameters.renderer)
		{
			if (control.type !== "boolean" && control.type !== "invertedboolean")
			{
				warn("Invalid type option " + control.type + " defined in renderer for " + item + ": will not be reverted");
				continue;
			}
			let checked = Engine.ConfigDB_GetValue("user", item) === "true";
			Engine["Renderer_Set" + control.parameters.renderer + "Enabled"](checked);
		}
		// and the possible function calls (which are of number or string types)
		if (control.parameters.function)
		{
			if (control.type !== "string" && control.type !== "number")
			{
				warn("Invalid type option " + control.type + " defined with function for " + item + ": will not be reverted");
				continue;
			}
			let caption = Engine.ConfigDB_GetValue("user", item);
			Engine[control.parameters.function](+caption);
		}
	}
	Engine.ConfigDB_SetChanges("user", false);
	init();
}

function saveChanges()
{
	registerChanges();
	Engine.ConfigDB_WriteFile("user", "config/user.cfg");
	Engine.ConfigDB_SetChanges("user", false);
	updateOptionPanel();
}

/**
 * Close GUI page and call callbacks if they exist.
 **/
function closePage()
{
	registerChanges();
	if (Engine.ConfigDB_HasChanges("user"))
	{
		let btCaptions = [translate("No"), translate("Yes")];
		let btCode = [null, function(){ closePageWithoutConfirmation(); }];
		messageBox(500, 200, translate("You have unsaved changes, do you want to close this window?"),
			translate("Warning"), 0, btCaptions, btCode);
	}
	else
		closePageWithoutConfirmation();
}

function closePageWithoutConfirmation()
{
	if (g_HasCallback)
		Engine.PopGuiPageCB();
	else
		Engine.PopGuiPage();
}
