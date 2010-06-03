/**
* jQuery UI Labs - buttons
* - for experimental use only -
* this class is intended to get used as a base class for other ui-plugins that may want to read options giving in class attributes of ui.element
* Copyleft (l) 2009 Jonathan gotti aka malko < jgotti at jgotti dot org >
* Dual licensed under the MIT and GPL licenses.
* http://docs.jquery.com/License
* Depends:
*		ui.core.js
*/
(function($){

	$.ui.classnameoptions = {
		/*
		* read extra options settings in widget.element's class attribute and return them as object
		* baseClass is the extended class (ui-button),
		* optionsList an associtive list of optionNames with their possible values separated by a pipe '|'
		* if an empty value is set at first position it'll be considered optional.
		*/
		_readClassNameOpts: function(optionsList,baseClass,elmt){
			if( ! baseClass)
				baseClass = this.widgetBaseClass;
			elmt=(!elmt)?this.element:$(elmt);
			//prepare expression
			var exp = '(?:^|\\s)'+baseClass+'(?=-)';
			var opts={}, optName;
			var classAttr = elmt.attr('class');
			if(null===classAttr || classAttr.length <1)
				return opts;
			for(optName in optionsList ){
				exp += ( optionsList[optName].substr(0,1)=='|' )?'(?:-('+optionsList[optName].substr(1)+'))?':'-('+optionsList[optName]+')';
			}
			exp = new RegExp(exp+'(?:$|\\s)');
			var matches = classAttr.match(exp);
			if( null==matches)
				return opts;
			//prepare options objects from matches
			var id=1;
			for(optName in optionsList){
				if( matches[id]){
					opts[optName] = matches[id];
				}
				id++;
			}
			return opts;
		},
		// add options settings only if current option setting is different from default option value else just ignore it.
		_mergeOpts: function(opts){
			var defaults = $[this.namespace][this.widgetName].defaults;
			for( var optName in opts){
				if( defaults[optName] === this.options[optName] ){
					this.options[optName] = opts[optName];
				}
			}
			return this;
		},
		// effectively apply settings by calling _setData on given options names.
		// additional parameter ifNotDefault will only apply settings if different from default.
		_applyOpts: function(names,ifNotDefault){
			if(! ifNotDefault){
				for(var i=0;i<names.length;i++){
					this._setData(names[i],this.options[names[i]]);
				}
				return this;
			}
			var defaults = $[this.namespace][this.widgetName].defaults;
			for(var i=0;i<names.length;i++){
				if( defaults[names[i]] !== this.options[names[i]] ){
					this._setData(names[i],this.options[names[i]]);
				}
			}
			return this;
		},
		/**
		* remove matching class names from element and eventually add new class on given element (default to widget.element)
		*/
		_rmExpClass:function(exp,add,elmt){
			elmt=(!elmt)?this.element:$(elmt);
			exp = new RegExp('(?:^|\\s)'+exp.replace(/\*/g,'[a-zA-Z_0-9-]*')+'(?=$|\\s)','g');
			elmt.attr('class',elmt.attr('class').replace(exp,''));
			if( undefined!==add ){
				elmt.addClass(add);
			}
			return this;
		}
	};

})(jQuery);
